import { canCollectFeeOnline } from '../domain/plans.js';
import { FEE_METHOD_LABELS, daysLabel, lateChangeOptionLabel, yen } from '../domain/rules.js';
import type { Booking, ChangeRequest, Host, Organization, Student } from '../shared/types.js';
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
        `予約の確認・キャンセル・変更: ${links(ctx).mine}` +
        (host.lateChangeThresholdDays > 0
          ? `\n※レッスン開始の${daysLabel(host.lateChangeThresholdDays)}前を過ぎると、キャンセル・変更には講師の承認が必要になります。`
          : '') +
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
        text: `${host.displayName} さん\n\n生徒が予約をキャンセルしました(${immediateReason(host)})。\n\n生徒: ${student.name || '(名前未設定)'} <${student.email}>\n日時: ${range(before, tz)}\n\n予約一覧: ${links(ctx).host}` + footer(ctx),
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
      text: `${host.displayName} さん\n\n生徒がレッスンの日時を変更しました(${immediateReason(host)})。\n\n生徒: ${student.name || '(名前未設定)'} <${student.email}>\n変更前: ${range(before, tz)}\n変更後: ${range(after, tz)}\n\n予約一覧: ${links(ctx).host}` + footer(ctx),
    },
  ];
}

export function changeRequestedMails(ctx: TemplateContext, host: Host, student: Student, request: ChangeRequest, booking: Booking): EmailMessage[] {
  const tz = host.timezone;
  const kindJa = request.kind === 'cancel' ? 'キャンセル' : '日時変更';
  const proposed = request.proposedStartAts.map((c, i) => `\n第${i + 1}希望: ${fmt(c, tz)}`).join('');
  const option =
    lateChangeOptionLabel(request.option, host.rescheduleRangeDays) + (request.feeMethod ? `(支払い方法: ${FEE_METHOD_LABELS[request.feeMethod]})` : '');
  return [
    {
      to: host.email,
      subject: `【要承認】${student.name || student.email} から${kindJa}の申請`,
      text:
        `${host.displayName} さん\n\nレッスン開始まで${daysLabel(host.lateChangeThresholdDays)}未満の${kindJa}申請が届きました。承認または却下してください。\n\n` +
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
        `\n\n予約の確認: ${links(ctx).mine}` +
        // リマインドはレッスンの 24 時間以内に送るので、承認制の日数が 1 日以上なら必ず承認制の期間内
        (host.lateChangeThresholdDays > 0
          ? `\n※開始${daysLabel(host.lateChangeThresholdDays)}前を過ぎているため、キャンセル・変更には講師の承認が必要です。`
          : '') +
        footer(ctx),
    },
  ];
}

/** 支払い方法ごとの案内。承認メールと支払い方法変更メールで使う */
function feeGuide(ctx: TemplateContext, host: Host, booking: Booking): string {
  const amount = booking.cancellationFeeAmount !== null ? `\nキャンセルフィー: ${yen(booking.cancellationFeeAmount)}` : '\nキャンセルフィー: 金額は講師の案内に従ってください';
  const method = booking.cancellationFeeMethod;
  if (!method) return `${amount}\nお支払い方法は講師の案内に従ってください。`;
  const head = `${amount}\nお支払い方法: ${FEE_METHOD_LABELS[method]}`;
  switch (method) {
    case 'card':
      return canCollectFeeOnline(host)
        ? `${head}\nマイ予約からクレジットカードでお支払いください: ${links(ctx).mine}`
        : `${head}\n現在カード決済を受け付けていません。講師の案内に従ってください。`;
    case 'bank_transfer':
      return host.bankTransferInfo.trim()
        ? `${head}\n振込先:\n${host.bankTransferInfo.trim()}\n※振込手数料はご負担ください。期限は講師の案内に従ってください。`
        : `${head}\n振込先は講師の案内に従ってください。`;
    case 'in_person':
      return `${head}\n次回のレッスン時に講師へ直接お支払いください。`;
  }
}

export function feeMethodChangedMails(ctx: TemplateContext, host: Host, student: Student, booking: Booking): EmailMessage[] {
  return [
    {
      to: student.email,
      subject: `【お支払い方法の変更】キャンセルフィー(${host.displayName})`,
      text:
        `${studentName(student)}\n\n${host.displayName} がキャンセルフィーのお支払い方法を変更しました。\n\n対象のレッスン: ${range(booking, host.timezone)}` +
        feeGuide(ctx, host, booking) +
        `\n\n予約の確認: ${links(ctx).mine}` +
        footer(ctx),
    },
  ];
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

export function orgInvitedMails(ctx: TemplateContext, org: Organization, inviter: Host, email: string): EmailMessage[] {
  return [
    {
      to: email,
      subject: `【招待】${inviter.displayName} さんから教室「${org.name}」への招待が届いています`,
      text:
        `${inviter.displayName} さんが、あなたを教室「${org.name}」の講師として招待しました。\n\n` +
        `参加するには:\n1. ${ctx.appBaseUrl}/ を開き、このメールアドレス(${email})でログインする\n` +
        `2. まだ講師登録をしていなければ「講師の方」から登録する\n3. 講師画面の「教室」タブで招待を承諾する\n\n` +
        `教室に参加すると、教室の契約でプロプランの機能が使えるようになります。あなたの予約や生徒の情報が教室の管理者に共有されることはありません。` +
        footer(ctx),
    },
  ];
}

/** 即時反映になった理由の文言 */
function immediateReason(host: Host): string {
  return host.lateChangeThresholdDays > 0 ? `レッスン開始の${daysLabel(host.lateChangeThresholdDays)}以上前のため即時反映` : '即時反映';
}
