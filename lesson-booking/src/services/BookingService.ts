import type { CalendarClient } from '../calendar/CalendarClient.js';
import { DomainError } from '../domain/errors.js';
import { availableFeeMethods, limitsFor } from '../domain/plans.js';
import { monthRange } from '../domain/time.js';
import {
  FEE_METHOD_LABELS,
  assertWithinBookingWindow,
  isLateChange,
  isWithinRescheduleRange,
  validateLateChangeRequest,
} from '../domain/rules.js';
import type { Booking, ChangeKind, ChangeRequest, FeeMethod, Host, LateChangeOption, Student } from '../domain/types.js';
import { noopNotifier, safeNotify, type Notifier } from '../notify/Notifier.js';
import type { Clock } from '../repo/InMemoryRepositories.js';
import type { Repositories } from '../repo/Repository.js';
import type { AvailabilityService } from './AvailabilityService.js';

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
  /** kind=reschedule のとき必須 */
  proposedStartAt?: Date | undefined;
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
    assertWithinBookingWindow(input.startAt, now, host.minLeadMinutes);

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

    const eventId = await this.writeCalendarEvent(host, booking, input.student);
    if (eventId) booking = await this.repos.bookings.update(booking.id, { calendarEventId: eventId });

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
   * - レッスン開始まで14日以上: 即時反映
   * - 14日未満: メッセージ+対応方法が必須。変更要求を作成して主催者の承認待ちにする(予約は確定状態のまま)
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

    if (input.kind === 'reschedule' && !input.proposedStartAt) {
      throw new DomainError('validation', '振替希望日時を指定してください', { field: 'proposedStartAt' });
    }

    if (!isLateChange(lessonStart, now)) {
      // 猶予あり → 即時反映
      const updated =
        input.kind === 'cancel'
          ? await this.applyCancel(host, booking, 'none')
          : await this.applyReschedule(host, booking, input.proposedStartAt as Date);
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
      proposedStartAt: input.proposedStartAt,
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
    if (validated.proposedStartAt) {
      // 振替先は受付ウィンドウ内かつ空いていることを要求時点でも確認する
      assertWithinBookingWindow(validated.proposedStartAt, now, host.minLeadMinutes);
      if (!(await this.availability.isSlotAvailable(host, validated.proposedStartAt, booking.id))) {
        throw new DomainError('slot_unavailable', '振替希望の枠は予約できません', {
          proposedStartAt: validated.proposedStartAt.toISOString(),
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
      proposedStartAt: validated.proposedStartAt?.toISOString() ?? null,
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
      if (!request.proposedStartAt) throw new DomainError('invalid_state', '振替先日時がありません');
      const proposed = new Date(request.proposedStartAt);
      if (!isWithinRescheduleRange(new Date(booking.startAt), proposed)) {
        throw new DomainError('validation', '振替先が範囲外です');
      }
      updated = await this.applyReschedule(host, booking, proposed);
    }
    const approved = await this.repos.changeRequests.update(request.id, {
      status: 'approved',
      decisionNote: note?.trim() || null,
      decidedAt: now,
    });
    const after = updated;
    await safeNotify(() => this.notifier.changeDecided({ host, student, request: approved, before: booking, after }));
    return { request: approved, booking: updated };
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

  private async applyReschedule(host: Host, booking: Booking, newStart: Date): Promise<Booking> {
    const now = this.clock.now();
    assertWithinBookingWindow(newStart, now, host.minLeadMinutes);
    if (!(await this.availability.isSlotAvailable(host, newStart, booking.id))) {
      throw new DomainError('slot_unavailable', '振替先の枠は予約できません', { startAt: newStart.toISOString() });
    }
    const newEnd = new Date(newStart.getTime() + host.lessonMinutes * 60_000);
    const target = await this.writeTargetCalendar(host.id);
    if (booking.calendarEventId && target) {
      await this.calendar.updateEvent(host.id, target, booking.calendarEventId, {
        startAt: newStart.toISOString(),
        endAt: newEnd.toISOString(),
        timezone: host.timezone,
      });
    }
    return this.repos.bookings.update(booking.id, {
      startAt: newStart.toISOString(),
      endAt: newEnd.toISOString(),
      // 新しい日時について改めて前日リマインドを送る
      reminderSentAt: null,
    });
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
