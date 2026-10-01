import type { CalendarClient } from '../calendar/CalendarClient.js';
import { DomainError } from '../domain/errors.js';
import { availableFeeMethods, limitsFor } from '../domain/plans.js';
import { monthRange } from '../domain/time.js';
import {
  FEE_METHOD_LABELS,
  assertWithinBookingWindow,
  validateCandidates,
  isLateChange,
  validateLateChangeRequest,
} from '../domain/rules.js';
import type { Booking, ChangeKind, ChangeRequest, FeeMethod, Host, LateChangeOption, Student } from '../domain/types.js';
import { noopNotifier, safeNotify, type Notifier } from '../notify/Notifier.js';
import type { Clock } from '../repo/InMemoryRepositories.js';
import type { Repositories } from '../repo/Repository.js';
import type { AvailabilityService, SlotCheck } from './AvailabilityService.js';

export type { Notifier } from '../notify/Notifier.js';

export interface CreateBookingInput {
  hostId: string;
  student: Student;
  startAt: Date;
  note?: string | undefined;
}

export interface ChangeInput {
  bookingId: string;
  student: Student;
  kind: ChangeKind;
  /** 直前変更時に必須 */
  message?: string | undefined;
  option?: LateChangeOption | undefined;
  /**
   * kind=reschedule のとき必須。第1希望から順。
   * 猶予あり(即時反映)の変更では 1 件だけ、直前(承認制)では最大 3 件
   */
  proposedStartAts?: Date[] | undefined;
  /** option=pay_cancellation_fee のとき必須 */
  feeMethod?: FeeMethod | undefined;
}

export type ChangeOutcome =
  | { type: 'applied'; booking: Booking }
  | { type: 'pending_approval'; booking: Booking; request: ChangeRequest };

export class BookingService {
  constructor(
    private readonly repos: Repositories,
    private readonly calendar: CalendarClient,
    private readonly availability: AvailabilityService,
    private readonly clock: Clock,
    private readonly notifier: Notifier = noopNotifier,
  ) {}

  // ---------- 予約 ----------

  async createBooking(input: CreateBookingInput): Promise<Booking> {
    const host = await this.availability.getHost(input.hostId);
    const now = this.clock.now();
    assertWithinBookingWindow(input.startAt, now, host.minLeadMinutes, host.bookingHorizonDays);

    if (!(await this.availability.isSlotAvailable(host, input.startAt))) {
      throw new DomainError('slot_unavailable', 'この枠は予約できません(営業時間外、または既に予定があります)', {
        startAt: input.startAt.toISOString(),
      });
    }
    await this.assertMonthlyQuota(host, input.startAt);

    const endAt = new Date(input.startAt.getTime() + host.lessonMinutes * 60_000);
    let booking = await this.repos.bookings.create({
      hostId: host.id,
      studentId: input.student.id,
      startAt: input.startAt.toISOString(),
      endAt: endAt.toISOString(),
      status: 'confirmed',
      calendarEventId: null,
      note: input.note?.trim() || null,
      cancellationFeeStatus: 'none',
      cancellationFeeAmount: null,
      cancellationFeeMethod: null,
      reminderSentAt: null,
    });

    // カレンダーへの書き込みは付加機能。失敗しても予約は成立させる(以前は予約が確定したまま
    // 生徒にはエラーが返り、確認メールも届かず、同じ枠の取り直しもできなかった)
    try {
      const eventId = await this.writeCalendarEvent(host, booking, input.student);
      if (eventId) booking = await this.repos.bookings.update(booking.id, { calendarEventId: eventId });
    } catch (e) {
      console.error('[booking] カレンダーへのイベント作成に失敗しました。予約は成立しています', booking.id, e);
    }

    const created = booking;
    await safeNotify(() => this.notifier.bookingCreated({ host, student: input.student, booking: created }));
    return booking;
  }

  async getBookingForStudent(bookingId: string, student: Student): Promise<Booking> {
    const booking = await this.mustBooking(bookingId);
    if (booking.studentId !== student.id) throw new DomainError('forbidden', 'この予約を操作する権限がありません');
    return booking;
  }

  async getBookingForHost(bookingId: string, hostId: string): Promise<Booking> {
    const booking = await this.mustBooking(bookingId);
    if (booking.hostId !== hostId) throw new DomainError('forbidden', 'この予約を操作する権限がありません');
    return booking;
  }

  // ---------- キャンセル・変更 ----------

  /**
   * 生徒によるキャンセル/変更。
   * - レッスン開始まで講師の lateChangeThresholdDays 日以上: 即時反映
   * - それ未満: メッセージ+対応方法が必須。変更要求を作成して主催者の承認待ちにする(予約は確定状態のまま)
   */
  async requestChange(input: ChangeInput): Promise<ChangeOutcome> {
    const booking = await this.getBookingForStudent(input.bookingId, input.student);
    if (booking.status !== 'confirmed') {
      throw new DomainError('invalid_state', 'この予約は既にキャンセルされています');
    }
    const host = await this.availability.getHost(booking.hostId);
    const now = this.clock.now();
    const lessonStart = new Date(booking.startAt);
    if (lessonStart.getTime() <= now.getTime()) {
      throw new DomainError('invalid_state', '開始済み・終了済みのレッスンは変更できません');
    }
    const pending = await this.repos.changeRequests.findPendingByBooking(booking.id);
    if (pending) {
      throw new DomainError('change_request_pending', '承認待ちの変更要求があります。主催者の判断をお待ちください', {
        requestId: pending.id,
      });
    }

    const candidates = input.proposedStartAts ?? [];

    if (!isLateChange(lessonStart, now, host.lateChangeThresholdDays)) {
      // 猶予あり → 即時反映。承認がないので変更先は 1 つに決まっている必要がある
      let newStart: Date | null = null;
      if (input.kind === 'reschedule') {
        newStart = validateCandidates(booking, candidates, 1)[0] as Date;
      }
      const updated =
        input.kind === 'cancel' ? await this.applyCancel(host, booking, 'none') : await this.applyReschedule(host, booking, newStart as Date);
      await safeNotify(() =>
        this.notifier.bookingChanged({ host, student: input.student, kind: input.kind, before: booking, after: updated }),
      );
      return { type: 'applied', booking: updated };
    }

    // 直前 → 承認制
    const validated = validateLateChangeRequest(booking, {
      kind: input.kind,
      option: input.option,
      message: input.message,
      proposedStartAts: candidates,
      rescheduleRangeDays: host.rescheduleRangeDays,
      lateChangeThresholdDays: host.lateChangeThresholdDays,
    });
    let feeMethod: FeeMethod | null = null;
    if (validated.option === 'pay_cancellation_fee') {
      const allowed = availableFeeMethods(host);
      if (allowed.length === 0) {
        throw new DomainError('validation', 'この講師はキャンセルフィーの支払い方法を設定していません。「承認を求める」で申請してください', {
          field: 'feeMethod',
        });
      }
      if (!input.feeMethod || !allowed.includes(input.feeMethod)) {
        throw new DomainError('validation', `支払い方法を選択してください(${allowed.map((m) => FEE_METHOD_LABELS[m]).join(' / ')})`, {
          field: 'feeMethod',
          allowed,
        });
      }
      feeMethod = input.feeMethod;
    }
    // 希望日時はすべて、受付ウィンドウ内かつ申請時点で空いていること(候補の枠は確保しない。承認時に再確認する)
    for (const [i, c] of validated.proposedStartAts.entries()) {
      assertWithinBookingWindow(c, now, host.minLeadMinutes, host.bookingHorizonDays);
      if (!(await this.availability.isSlotAvailable(host, c, booking.id))) {
        throw new DomainError('slot_unavailable', `第${i + 1}希望の枠は予約できません。別の日時を選んでください`, {
          proposedStartAt: c.toISOString(),
          rank: i + 1,
        });
      }
    }

    const request = await this.repos.changeRequests.create({
      bookingId: booking.id,
      hostId: host.id,
      studentId: input.student.id,
      kind: input.kind,
      option: validated.option,
      message: validated.message,
      proposedStartAts: validated.proposedStartAts.map((c) => c.toISOString()),
      approvedStartAt: null,
      feeMethod,
      status: 'pending',
      decisionNote: null,
    });
    await safeNotify(() => this.notifier.changeRequested({ host, student: input.student, request, booking }));
    return { type: 'pending_approval', booking, request };
  }

  // ---------- 主催者の承認 ----------

  async listPendingRequests(hostId: string): Promise<ChangeRequest[]> {
    return this.repos.changeRequests.listByHost(hostId, 'pending');
  }

  async decideRequest(
    requestId: string,
    hostId: string,
    decision: 'approve' | 'reject',
    note?: string,
    /** 振替の承認時に、講師が希望日時の中から選んだ日時。候補が 1 つなら省略可 */
    chosenStartAt?: Date,
  ): Promise<{ request: ChangeRequest; booking: Booking }> {
    const request = await this.repos.changeRequests.findById(requestId);
    if (!request) throw new DomainError('not_found', '変更要求が見つかりません', { requestId });
    if (request.hostId !== hostId) throw new DomainError('forbidden', 'この変更要求を判断する権限がありません');
    if (request.status !== 'pending') {
      throw new DomainError('invalid_state', 'この変更要求は既に処理されています', { status: request.status });
    }
    const booking = await this.mustBooking(request.bookingId);
    const host = await this.availability.getHost(booking.hostId);
    const student = await this.repos.students.findById(booking.studentId);
    if (!student) throw new DomainError('not_found', '生徒が見つかりません');
    const now = this.clock.now().toISOString();

    if (decision === 'reject') {
      const rejected = await this.repos.changeRequests.update(request.id, {
        status: 'rejected',
        decisionNote: note?.trim() || null,
        decidedAt: now,
      });
      await safeNotify(() => this.notifier.changeDecided({ host, student, request: rejected, before: booking, after: booking }));
      return { request: rejected, booking };
    }

    let updated: Booking;
    let approvedStartAt: string | null = null;
    if (request.kind === 'cancel') {
      const fee = request.option === 'pay_cancellation_fee' ? 'pending' : 'none';
      updated = await this.applyCancel(host, booking, fee);
      if (fee === 'pending') {
        // 承認時点の金額と、生徒が選び講師が承認した支払い方法を記録(後で講師が設定を変えても、この請求は変わらない)
        updated = await this.repos.bookings.update(updated.id, {
          cancellationFeeAmount: host.cancellationFeeAmount,
          cancellationFeeMethod: request.feeMethod,
        });
      }
    } else {
      // 振替期間は申請時点の講師設定で検証済み。承認後に講師が期間を縮めても、受け付けた希望は承認できる
      const proposed = this.pickCandidate(request, chosenStartAt);
      // 申請後に埋まっていれば slot_unavailable。講師は別の候補を選ぶか却下する
      updated = await this.applyReschedule(host, booking, proposed);
      approvedStartAt = proposed.toISOString();
    }
    const approved = await this.repos.changeRequests.update(request.id, {
      status: 'approved',
      approvedStartAt,
      decisionNote: note?.trim() || null,
      decidedAt: now,
    });
    const after = updated;
    await safeNotify(() => this.notifier.changeDecided({ host, student, request: approved, before: booking, after }));
    return { request: approved, booking: updated };
  }

  /** 振替の候補ごとに、今も空いているか(講師の承認画面用) */
  /**
   * 承認待ちの振替申請それぞれについて、希望日時が今も空いているか。講師の申請をまとめて 1 回で調べる。
   * 戻り値は申請 ID → 候補ごとの空き状況(振替以外・処理済みの申請は空配列)
   */
  async candidateAvailability(
    host: Host,
    requests: readonly ChangeRequest[],
  ): Promise<Map<string, { startAt: string; available: boolean }[]>> {
    const now = this.clock.now();
    const out = new Map<string, { startAt: string; available: boolean }[]>();
    const checks: { requestId: string; startAt: string; check: SlotCheck }[] = [];
    for (const r of requests) {
      out.set(r.id, []);
      if (r.kind !== 'reschedule' || r.status !== 'pending' || r.hostId !== host.id) continue;
      for (const iso of r.proposedStartAts) {
        const d = new Date(iso);
        if (d.getTime() > now.getTime()) checks.push({ requestId: r.id, startAt: iso, check: { startAt: d, excludeBookingId: r.bookingId } });
        else out.get(r.id)?.push({ startAt: iso, available: false });
      }
    }
    const results = await this.availability.checkSlots(host, checks.map((c) => c.check));
    checks.forEach((c, i) => out.get(c.requestId)?.push({ startAt: c.startAt, available: results[i] ?? false }));
    // 希望順(proposedStartAts の順)に並べ直す
    for (const r of requests) {
      const list = out.get(r.id) ?? [];
      list.sort((a, b) => r.proposedStartAts.indexOf(a.startAt) - r.proposedStartAts.indexOf(b.startAt));
    }
    return out;
  }

  private pickCandidate(request: ChangeRequest, chosen: Date | undefined): Date {
    if (request.proposedStartAts.length === 0) throw new DomainError('invalid_state', '振替の希望日時がありません');
    if (!chosen) {
      if (request.proposedStartAts.length > 1) {
        throw new DomainError('validation', '希望日時の中から振替先を選んでください', {
          field: 'startAt',
          candidates: request.proposedStartAts,
        });
      }
      return new Date(request.proposedStartAts[0] as string);
    }
    const iso = chosen.toISOString();
    if (!request.proposedStartAts.includes(iso)) {
      throw new DomainError('validation', '振替先は生徒の希望日時の中から選んでください', { field: 'startAt', candidates: request.proposedStartAts });
    }
    return chosen;
  }

  /**
   * 主催者が、承認済み・未払いのキャンセルフィーの支払い方法を変更する(生徒から相談を受けた場合など)。
   * 講師の判断なので追加の承認は不要。生徒に新しい支払い方法の案内を送る。
   */
  async changeFeeMethod(bookingId: string, hostId: string, method: FeeMethod): Promise<Booking> {
    const booking = await this.getBookingForHost(bookingId, hostId);
    if (booking.cancellationFeeStatus !== 'pending') throw new DomainError('invalid_state', 'この予約に未払いのキャンセルフィーはありません');
    const host = await this.availability.getHost(hostId);
    const allowed = availableFeeMethods(host);
    if (!allowed.includes(method)) {
      throw new DomainError('validation', `${FEE_METHOD_LABELS[method]}は現在受け付けていません。設定画面で有効にしてください`, { allowed });
    }
    if (booking.cancellationFeeMethod === method) return booking;
    const updated = await this.repos.bookings.update(booking.id, { cancellationFeeMethod: method });
    const student = await this.repos.students.findById(booking.studentId);
    if (student) await safeNotify(() => this.notifier.feeMethodChanged({ host, student, booking: updated }));
    return updated;
  }

  /** 主催者がキャンセルフィーの入金を確認したとき */
  async markFeePaid(bookingId: string, hostId: string): Promise<Booking> {
    const booking = await this.getBookingForHost(bookingId, hostId);
    if (booking.cancellationFeeStatus !== 'pending') {
      throw new DomainError('invalid_state', 'この予約に未払いのキャンセルフィーはありません');
    }
    return this.repos.bookings.update(booking.id, { cancellationFeeStatus: 'paid' });
  }

  // ---------- 主催者によるキャンセル(休講) ----------

  /**
   * 主催者が予約を取り消す。生徒にはメッセージ(reason)付きで通知する。
   * 承認待ちの変更要求がある予約は、先にその要求を判断してもらう(二重処理を避ける)。
   */
  async cancelByHost(bookingId: string, hostId: string, reason: string): Promise<Booking> {
    const trimmed = reason.trim();
    if (!trimmed) throw new DomainError('validation', '生徒へのメッセージを入力してください', { field: 'reason' });
    const booking = await this.getBookingForHost(bookingId, hostId);
    if (booking.status !== 'confirmed') throw new DomainError('invalid_state', 'この予約は既にキャンセルされています');
    if (new Date(booking.startAt).getTime() <= this.clock.now().getTime()) {
      throw new DomainError('invalid_state', '開始済み・終了済みのレッスンはキャンセルできません');
    }
    const pending = await this.repos.changeRequests.findPendingByBooking(booking.id);
    if (pending) {
      throw new DomainError('change_request_pending', 'この予約には生徒からの承認待ちの申請があります。先に承認または却下してください', {
        requestId: pending.id,
      });
    }
    return this.cancelByHostUnchecked(booking, trimmed, { bestEffortCalendar: false });
  }

  /**
   * 退会処理などで、主催者の今後の予約をすべて取り消す。
   * 承認待ちの要求は却下扱いにし、カレンダー削除の失敗は無視する(連携が既に切れている場合がある)。
   */
  async cancelAllFutureByHost(hostId: string, reason: string): Promise<Booking[]> {
    const now = this.clock.now();
    const far = new Date(now.getTime() + 3650 * 86_400_000);
    const future = await this.repos.bookings.listConfirmedByHost(hostId, now, far);
    const out: Booking[] = [];
    for (const b of future) {
      if (new Date(b.startAt).getTime() <= now.getTime()) continue;
      const pending = await this.repos.changeRequests.findPendingByBooking(b.id);
      if (pending) {
        await this.repos.changeRequests.update(pending.id, {
          status: 'rejected',
          decisionNote: reason,
          decidedAt: now.toISOString(),
        });
      }
      out.push(await this.cancelByHostUnchecked(b, reason, { bestEffortCalendar: true }));
    }
    return out;
  }

  private async cancelByHostUnchecked(booking: Booking, reason: string, opts: { bestEffortCalendar: boolean }): Promise<Booking> {
    const host = await this.availability.getHost(booking.hostId);
    const updated = await this.applyCancel(host, booking, 'none', opts);
    const student = await this.repos.students.findById(booking.studentId);
    if (student) {
      await safeNotify(() => this.notifier.cancelledByHost({ host, student, booking: updated, reason }));
    }
    return updated;
  }

  // ---------- 内部 ----------

  private async applyCancel(
    host: Host,
    booking: Booking,
    fee: Booking['cancellationFeeStatus'],
    opts: { bestEffortCalendar: boolean } = { bestEffortCalendar: false },
  ): Promise<Booking> {
    const target = await this.writeTargetCalendar(host.id);
    if (booking.calendarEventId && target) {
      try {
        await this.calendar.deleteEvent(host.id, target, booking.calendarEventId);
      } catch (e) {
        if (!opts.bestEffortCalendar) throw e;
        console.warn('[booking] カレンダーイベントの削除に失敗しましたが処理を続行します', e);
      }
    }
    return this.repos.bookings.update(booking.id, {
      status: 'cancelled',
      calendarEventId: null,
      cancellationFeeStatus: fee,
    });
  }

  /**
   * 予約の日時を変える。DB を正とし、先に DB を更新してからカレンダーを合わせる
   * (逆順だと、DB の更新が同時予約などで失敗したときにカレンダーだけ動いてしまう)
   */
  private async applyReschedule(host: Host, booking: Booking, newStart: Date): Promise<Booking> {
    const now = this.clock.now();
    assertWithinBookingWindow(newStart, now, host.minLeadMinutes, host.bookingHorizonDays);
    if (!(await this.availability.isSlotAvailable(host, newStart, booking.id))) {
      throw new DomainError('slot_unavailable', '振替先の枠は予約できません', { startAt: newStart.toISOString() });
    }
    // 別の月へ動かす場合は、その月の予約数上限(フリープラン)も確認する
    const fromMonth = monthRange(new Date(booking.startAt), host.timezone).from.getTime();
    if (monthRange(newStart, host.timezone).from.getTime() !== fromMonth) await this.assertMonthlyQuota(host, newStart);

    const newEnd = new Date(newStart.getTime() + host.lessonMinutes * 60_000);
    const updated = await this.repos.bookings.update(booking.id, {
      startAt: newStart.toISOString(),
      endAt: newEnd.toISOString(),
      // 新しい日時について改めて前日リマインドを送る
      reminderSentAt: null,
    });
    const target = await this.writeTargetCalendar(host.id);
    if (booking.calendarEventId && target) {
      try {
        await this.calendar.updateEvent(host.id, target, booking.calendarEventId, {
          startAt: newStart.toISOString(),
          endAt: newEnd.toISOString(),
          timezone: host.timezone,
        });
      } catch (e) {
        console.error('[booking] カレンダーのイベント更新に失敗しました。予約の日時は変更済みです', booking.id, e);
      }
    }
    return updated;
  }

  /** フリープランの月間予約上限(レッスン日の暦月で数える) */
  private async assertMonthlyQuota(host: Host, startAt: Date): Promise<void> {
    const limit = limitsFor(host).maxBookingsPerMonth;
    if (limit === null) return;
    const { from, to } = monthRange(startAt, host.timezone);
    const count = await this.repos.bookings.countConfirmedByHost(host.id, from, to);
    if (count >= limit) {
      throw new DomainError('plan_limit', `この月の予約枠が上限(${limit}件)に達しています。主催者にお問い合わせください`, {
        limit,
        month: from.toISOString(),
      });
    }
  }

  private async writeCalendarEvent(host: Host, booking: Booking, student: Student): Promise<string | null> {
    if (!limitsFor(host).calendarWrite) return null;
    const target = await this.writeTargetCalendar(host.id);
    if (!target) return null;
    const { eventId } = await this.calendar.createEvent(host.id, {
      calendarId: target,
      summary: `レッスン: ${student.name || student.email}`,
      description: [`予約ID: ${booking.id}`, `生徒: ${student.name} <${student.email}>`, booking.note ? `備考: ${booking.note}` : '']
        .filter(Boolean)
        .join('\n'),
      startAt: booking.startAt,
      endAt: booking.endAt,
      timezone: host.timezone,
      attendeeEmail: student.email,
    });
    return eventId;
  }

  private async writeTargetCalendar(hostId: string): Promise<string | null> {
    const calendars = await this.repos.hostCalendars.listByHost(hostId);
    return calendars.find((c) => c.role === 'write_target')?.calendarId ?? null;
  }

  private async mustBooking(id: string): Promise<Booking> {
    const booking = await this.repos.bookings.findById(id);
    if (!booking) throw new DomainError('not_found', '予約が見つかりません', { bookingId: id });
    return booking;
  }
}
