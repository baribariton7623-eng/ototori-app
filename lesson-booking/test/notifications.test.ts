import { beforeEach, describe, expect, it } from 'vitest';
import { jst, setupWorld, type TestWorld } from './helpers.js';

let w: TestWorld;
beforeEach(async () => {
  w = await setupWorld();
});

// 今 = 2026-10-01(木) 09:00 JST
const FAR = jst('2026-10-20T10:00:00');
const NEAR = jst('2026-10-06T10:00:00');
const TEACHER = 'teacher@example.com';
const STUDENT = 'student@example.com';

describe('通知メール', () => {
  it('予約すると生徒に確定、講師に新規予約のメールが届く(主催者タイムゾーン表記)', async () => {
    await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: FAR, note: '初回です' });
    expect(w.mail.sent).toHaveLength(2);
    const [toStudent] = w.mail.to(STUDENT);
    const [toHost] = w.mail.to(TEACHER);
    expect(toStudent?.subject).toBe('【予約確定】講師A 2026/10/20(火) 10:00');
    expect(toStudent?.text).toContain('2026/10/20(火) 10:00〜11:00');
    expect(toStudent?.text).toContain('https://app.example.com/#/mine');
    expect(toStudent?.text).toContain('備考: 初回です');
    expect(toHost?.subject).toContain('【新しい予約】生徒B');
    expect(toHost?.text).toContain('student@example.com');
  });

  it('猶予ありのキャンセル・変更は生徒と講師の双方に通知', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: FAR });
    w.mail.clear();
    await w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'reschedule', proposedStartAt: jst('2026-10-21T11:00:00') });
    expect(w.mail.to(STUDENT)[0]?.subject).toContain('【日時変更完了】');
    expect(w.mail.to(STUDENT)[0]?.text).toMatch(/変更前: 2026\/10\/20\(火\) 10:00〜11:00\n変更後: 2026\/10\/21\(水\) 11:00〜12:00/);
    expect(w.mail.to(TEACHER)[0]?.subject).toContain('【日時変更】');

    w.mail.clear();
    await w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'cancel' });
    expect(w.mail.to(STUDENT)[0]?.subject).toContain('【キャンセル完了】');
    expect(w.mail.to(TEACHER)[0]?.subject).toContain('【キャンセル】');
  });

  it('直前の申請: 講師に要承認(メッセージ・3択・振替希望つき)、生徒に受付メール', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: NEAR });
    w.mail.clear();
    await w.bookings.requestChange({
      bookingId: b.id,
      student: w.student,
      kind: 'reschedule',
      option: 'reschedule_within_two_weeks',
      message: '出張が入りました',
      proposedStartAt: jst('2026-10-13T14:00:00'),
    });
    const host = w.mail.to(TEACHER)[0];
    expect(host?.subject).toBe('【要承認】生徒B から日時変更の申請');
    expect(host?.text).toContain('対応方法: 2週間以内の別日に振替を希望する');
    expect(host?.text).toContain('振替希望: 2026/10/13(火) 14:00');
    expect(host?.text).toContain('出張が入りました');
    expect(host?.text).toContain('https://app.example.com/#/host');
    expect(w.mail.to(STUDENT)[0]?.subject).toContain('【申請受付】');
  });

  it('承認・却下の結果は生徒にだけ届き、講師のメッセージとフィー案内が入る', async () => {
    const b1 = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: NEAR });
    const b2 = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-07T10:00:00') });
    const r1 = await w.bookings.requestChange({ bookingId: b1.id, student: w.student, kind: 'cancel', message: 'a', option: 'pay_cancellation_fee', feeMethod: 'in_person' });
    const r2 = await w.bookings.requestChange({ bookingId: b2.id, student: w.student, kind: 'cancel', message: 'b', option: 'request_approval' });
    if (r1.type !== 'pending_approval' || r2.type !== 'pending_approval') throw new Error('unexpected');
    w.mail.clear();

    await w.bookings.decideRequest(r1.request.id, w.host.id, 'approve', '次回お支払いください');
    expect(w.mail.sent).toHaveLength(1);
    expect(w.mail.sent[0]?.to).toBe(STUDENT);
    expect(w.mail.sent[0]?.subject).toBe('【申請結果】キャンセルが承認されました');
    expect(w.mail.sent[0]?.text).toContain('キャンセルフィー: 3,000円');
    expect(w.mail.sent[0]?.text).toContain('お支払い方法: 次回レッスン時に手渡し');
    expect(w.mail.sent[0]?.text).toContain('次回のレッスン時に講師へ直接お支払いください');
    expect(w.mail.sent[0]?.text).toContain('次回お支払いください');

    w.mail.clear();
    await w.bookings.decideRequest(r2.request.id, w.host.id, 'reject', '直前のため');
    expect(w.mail.sent).toHaveLength(1);
    expect(w.mail.sent[0]?.subject).toBe('【申請結果】キャンセルは承認されませんでした');
    expect(w.mail.sent[0]?.text).toContain('予約はそのまま有効です');
  });

  it('メール送信に失敗しても予約は成立する', async () => {
    w.mail.failNext = true;
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: FAR });
    expect(b.status).toBe('confirmed');
    // 1 通目(生徒宛)が失敗しても、講師宛は送られている
    expect(w.mail.to(TEACHER)).toHaveLength(1);
  });
});

describe('講師による休講', () => {
  it('メッセージ付きで取り消し、生徒に通知。カレンダーのイベントも消える', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: NEAR });
    w.mail.clear();
    const cancelled = await w.bookings.cancelByHost(b.id, w.host.id, '発熱のため休講します。申し訳ありません。');
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancellationFeeStatus).toBe('none');
    expect(w.calendar.listEvents()).toHaveLength(0);
    const m = w.mail.to(STUDENT)[0];
    expect(m?.subject).toContain('【休講のお知らせ】');
    expect(m?.text).toContain('発熱のため休講します');
    expect(m?.text).toContain('https://app.example.com/#/h/teacher-a');
  });

  it('メッセージ必須・承認待ちがあれば先に判断が必要・他の主催者は不可', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: NEAR });
    await expect(w.bookings.cancelByHost(b.id, w.host.id, '  ')).rejects.toMatchObject({ code: 'validation' });

    await w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'cancel', message: 'x', option: 'request_approval' });
    await expect(w.bookings.cancelByHost(b.id, w.host.id, '休講')).rejects.toMatchObject({ code: 'change_request_pending' });

    const { id: _id, createdAt: _c, ...hostFields } = w.host;
    const other = await w.repos.hosts.create({ ...hostFields, email: 'x@example.com', slug: 'xx' });
    expect(other.id).not.toBe(w.host.id);
    await expect(w.bookings.cancelByHost(b.id, other.id, '休講')).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('退会', () => {
  it('主催者: 今後の予約を取り消して生徒に通知し、課金解約・Google 失効・全データ削除', async () => {
    await w.repos.googleCredentials.saveRefreshToken(w.host.id, 'rt');
    const future1 = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: NEAR });
    const future2 = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: FAR });
    // 承認待ちがあっても退会は進められる(却下扱い)
    const req = await w.bookings.requestChange({ bookingId: future1.id, student: w.student, kind: 'cancel', message: 'x', option: 'request_approval' });
    if (req.type !== 'pending_approval') throw new Error('unexpected');
    w.mail.clear();

    const result = await w.accounts.deleteAccount({ email: w.host.email, subject: 'auth-sub-1', host: w.host });
    expect(result).toEqual({ deletedHost: true, deletedStudent: false, cancelledBookings: 2 });
    expect(w.mail.to(STUDENT).filter((m) => m.subject.includes('休講'))).toHaveLength(2);
    expect(w.billingProvider.canceled).toEqual([w.host.id]);
    expect(w.cleanup.revoked).toEqual([w.host.id]);
    expect(w.cleanup.deletedAuthUsers).toEqual(['auth-sub-1']);
    expect(await w.repos.hosts.findById(w.host.id)).toBeNull();
    expect(await w.repos.bookings.findById(future2.id)).toBeNull();
    expect(await w.repos.hostCalendars.listByHost(w.host.id)).toHaveLength(0);
    expect(await w.repos.googleCredentials.getRefreshToken(w.host.id)).toBeNull();
    expect(w.calendar.listEvents()).toHaveLength(0);
  });

  it('主催者: 無料プランなら課金解約は呼ばない', async () => {
    await w.repos.hosts.update(w.host.id, { plan: 'free', subscriptionStatus: 'none' });
    const host = (await w.repos.hosts.findById(w.host.id))!;
    await w.accounts.deleteAccount({ email: host.email, subject: null, host });
    expect(w.billingProvider.canceled).toEqual([]);
  });

  it('生徒: 今後の予約があると退会できない。キャンセル後は予約履歴ごと削除される', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: FAR });
    await expect(w.accounts.deleteAccount({ email: w.student.email, subject: null, host: null })).rejects.toMatchObject({
      code: 'invalid_state',
    });
    await w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'cancel' });
    const result = await w.accounts.deleteAccount({ email: w.student.email, subject: null, host: null });
    expect(result.deletedStudent).toBe(true);
    expect(await w.repos.students.findById(w.student.id)).toBeNull();
    expect(await w.repos.bookings.findById(b.id)).toBeNull();
    // 主催者側は残る
    expect(await w.repos.hosts.findById(w.host.id)).not.toBeNull();
  });
});
