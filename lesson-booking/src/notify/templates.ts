import { canCollectFeeOnline } from '../domain/plans.js';
import { LATE_CHANGE_OPTION_LABELS } from '../domain/rules.js';
import type { Booking, ChangeRequest, Host, Student } from '../domain/types.js';
import type { EmailMessage } from './EmailSender.js';

/**
 * 通知メールの文面。純関数なのでテストしやすい。
 * 時刻は主催者のタイムゾーンで表示する。
 */

export interface TemplateContext {
  serviceName: string;
  appBaseUrl: string;
}

function fmt(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

function range(b: Booking, tz: string): string {
  const end = new Intl.DateTimeFormat('ja-JP', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(b.endAt),
  );
  return `${fmt(b.startAt, tz)}〜${end}`;
}

function studentName(s: Student): string {
  return s.name ? `${s.name} さん` : s.email;
}

function footer(ctx: TemplateContext): string {
  return `\n\n--\n${ctx.serviceName}\nこのメールは送信専用です。ご返信いただいてもお答えできません。`;
}

const links = (ctx: TemplateContext) => ({
  mine: `${ctx.appBaseUrl}/#/mine`,
  host: `${ctx.appBaseUrl}/#/host`,
  page: (h: Host) => `${ctx.appBaseUrl}/#/h/${h.slug}`,
});

export function bookingCreatedMails(ctx: TemplateContext, host: Host, student: Student, booking: Booking): EmailMessage[] {
  const tz = host.timezone;
  const when = range(booking, tz);
  const note = booking.note ? `\n備考: ${booking.note}` : '';
  return [
    {
      to: student.email,
      subject: `【予約確定】${host.displayName} ${fmt(booking.startAt, tz)}`,
      text:
        `${studentName(student)}\n\n${host.displayName} のレッスンの予約が確定しました。\n\n日時: ${when}${note}\n\n` +
        `予約の確認・キャンセル・変更: ${links(ctx).mine}\n` +
        `※レッスン開始の2週間前を過ぎると、キャンセル・変更には講師の承認が必要になります。` +
        footer(ctx),
    },
    {
      to: host.email,
      subject: `【新しい予約】${student.name || student.email} ${fmt(booking.startAt, tz)}`,
      text:
        `${host.displayName} さん\n\n新しい予約が入りました。\n\n生徒: ${student.name || '(名前未設定)'} <${student.email}>\n日時: ${when}${note}\n\n` +
        `予約一覧: ${links(ctx).host}` +
        footer(ctx),
    },
  ];
}

export function bookingChangedMails(
  ctx: TemplateContext,
  host: Host,
  student: Student,
  kind: 'cancel' | 'reschedule',
  before: Booking,
  after: Booking,
): EmailMessage[] {
  const tz = host.timezone;
  if (kind === 'cancel') {
    return [
      {
        to: student.email,
        subject: `【キャンセル完了】${host.displayName} ${fmt(before.startAt, tz)}`,
        text: `${studentName(student)}\n\n次のレッスンをキャンセルしました。\n\n日時: ${range(before, tz)}\n\n予約ページ: ${links(ctx).page(host)}` + footer(ctx),
      },
      {
        to: host.email,
        subject: `【キャンセル】${student.name || student.email} ${fmt(before.startAt, tz)}`,
        text: `${host.displayName} さん\n\n生徒が予約をキャンセルしました(レッスン開始の2週間以上前のため即時反映)。\n\n生徒: ${student.name || '(名前未設定)'} <${student.email}>\n日時: ${range(before, tz)}\n\n予約一覧: ${links(ctx).host}` + footer(ctx),
      },
    ];
  }
  return [
    {
      to: student.email,
      subject: `【日時変更完了】${host.displayName} ${fmt(after.startAt, tz)}`,
      text: `${studentName(student)}\n\nレッスンの日時を変更しました。\n\n変更前: ${range(before, tz)}\n変更後: ${range(after, tz)}\n\n予約の確認: ${links(ctx).mine}` + footer(ctx),
    },
    {
      to: host.email,
      subject: `【日時変更】${student.name || student.email} ${fmt(after.startAt, tz)}`,
      text: `${host.displayName} さん\n\n生徒がレッスンの日時を変更しました(レッスン開始の2週間以上前のため即時反映)。\n\n生徒: ${student.name || '(名前未設定)'} <${student.email}>\n変更前: ${range(before, tz)}\n変更後: ${range(after, tz)}\n\n予約一覧: ${links(ctx).host}` + footer(ctx),
    },
  ];
}

export function changeRequestedMails(ctx: TemplateContext, host: Host, student: Student, request: ChangeRequest, booking: Booking): EmailMessage[] {
  const tz = host.timezone;
  const kindJa = request.kind === 'cancel' ? 'キャンセル' : '日時変更';
  const proposed = request.proposedStartAt ? `\n振替希望: ${fmt(request.proposedStartAt, tz)}` : '';
  const option = LATE_CHANGE_OPTION_LABELS[request.option];
  return [
    {
      to: host.email,
      subject: `【要承認】${student.name || student.email} から${kindJa}の申請`,
      text:
        `${host.displayName} さん\n\nレッスン開始まで2週間未満の${kindJa}申請が届きました。承認または却下してください。\n\n` +
        `生徒: ${student.name || '(名前未設定)'} <${student.email}>\n対象: ${range(booking, tz)}\n対応方法: ${option}${proposed}\n\n` +
        `メッセージ:\n${request.message}\n\n承認・却下: ${links(ctx).host}` +
        footer(ctx),
    },
    {
      to: student.email,
      subject: `【申請受付】${host.displayName} ${fmt(booking.startAt, tz)} の${kindJa}`,
      text:
        `${studentName(student)}\n\n${kindJa}の申請を受け付けました。講師が承認するまで、元の予約はそのまま有効です。\n\n` +
        `対象: ${range(booking, tz)}\n対応方法: ${option}${proposed}\n\n結果はメールでお知らせします。申請状況: ${links(ctx).mine}` +
        footer(ctx),
    },
  ];
}

export function changeDecidedMails(
  ctx: TemplateContext,
  host: Host,
  student: Student,
  request: ChangeRequest,
  before: Booking,
  after: Booking,
): EmailMessage[] {
  const tz = host.timezone;
  const kindJa = request.kind === 'cancel' ? 'キャンセル' : '日時変更';
  const note = request.decisionNote ? `\n\n講師からのメッセージ:\n${request.decisionNote}` : '';
  if (request.status === 'rejected') {
    return [
      {
        to: student.email,
        subject: `【申請結果】${kindJa}は承認されませんでした`,
        text: `${studentName(student)}\n\n${host.displayName} への${kindJa}の申請は承認されませんでした。予約はそのまま有効です。\n\n日時: ${range(before, tz)}${note}\n\n予約の確認: ${links(ctx).mine}` + footer(ctx),
      },
    ];
  }
  const detail =
    request.kind === 'cancel'
      ? `キャンセルしたレッスン: ${range(before, tz)}` + (after.cancellationFeeStatus === 'pending' ? feeGuide(ctx, host, after) : '')
      : `変更前: ${range(before, tz)}\n変更後: ${range(after, tz)}`;
  return [
    {
      to: student.email,
      subject: `【申請結果】${kindJa}が承認されました`,
      text: `${studentName(student)}\n\n${host.displayName} への${kindJa}の申請が承認されました。\n\n${detail}${note}\n\n予約の確認: ${links(ctx).mine}` + footer(ctx),
    },
  ];
}

export function cancelledByHostMails(ctx: TemplateContext, host: Host, student: Student, booking: Booking, reason: string): EmailMessage[] {
  const tz = host.timezone;
  return [
    {
      to: student.email,
      subject: `【休講のお知らせ】${host.displayName} ${fmt(booking.startAt, tz)}`,
      text:
        `${studentName(student)}\n\n講師の都合により、次のレッスンはキャンセル(休講)となりました。\n\n日時: ${range(booking, tz)}\n\n` +
        `講師からのメッセージ:\n${reason}\n\n別の日時の予約: ${links(ctx).page(host)}` +
        footer(ctx),
    },
  ];
}

export function lessonReminderMails(ctx: TemplateContext, host: Host, student: Student, booking: Booking): EmailMessage[] {
  const tz = host.timezone;
  return [
    {
      to: student.email,
      subject: `【明日のレッスン】${host.displayName} ${fmt(booking.startAt, tz)}`,
      text:
        `${studentName(student)}\n\n${host.displayName} のレッスンのリマインドです。\n\n日時: ${range(booking, tz)}` +
        (booking.note ? `\n備考: ${booking.note}` : '') +
        `\n\n予約の確認: ${links(ctx).mine}\n` +
        `※開始2週間前を過ぎているため、キャンセル・変更には講師の承認が必要です。` +
        footer(ctx),
    },
  ];
}

export function yen(amount: number): string {
  return `${amount.toLocaleString('ja-JP')}円`;
}

function feeGuide(ctx: TemplateContext, host: Host, booking: Booking): string {
  if (booking.cancellationFeeAmount === null) return '\nキャンセルフィーのお支払いについては講師の案内に従ってください。';
  const amount = `\nキャンセルフィー: ${yen(booking.cancellationFeeAmount)}`;
  if (canCollectFeeOnline(host)) return `${amount}\nマイ予約からクレジットカードでお支払いいただけます: ${links(ctx).mine}`;
  return `${amount}\nお支払い方法は講師の案内に従ってください。`;
}

export function feePaidMails(ctx: TemplateContext, host: Host, student: Student, booking: Booking): EmailMessage[] {
  const tz = host.timezone;
  const amount = booking.cancellationFeeAmount !== null ? yen(booking.cancellationFeeAmount) : '';
  return [
    {
      to: host.email,
      subject: `【キャンセルフィー入金】${student.name || student.email} ${amount}`,
      text:
        `${host.displayName} さん\n\nキャンセルフィーがオンラインで支払われました。売上はあなたの Stripe アカウントに入金されます。\n\n` +
        `生徒: ${student.name || '(名前未設定)'} <${student.email}>\n対象のレッスン: ${range(booking, tz)}\n金額: ${amount}\n\n予約一覧: ${links(ctx).host}` +
        footer(ctx),
    },
    {
      to: student.email,
      subject: `【お支払い完了】キャンセルフィー ${amount}`,
      text: `${studentName(student)}\n\n${host.displayName} へのキャンセルフィー(${amount})のお支払いが完了しました。\n\n対象のレッスン: ${range(booking, tz)}` + footer(ctx),
    },
  ];
}
