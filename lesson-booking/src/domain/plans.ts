import type { Host, Plan } from './types.js';

/** プランごとの上限。null は無制限 */
export interface PlanLimits {
  /** 連携できるカレンダー数 */
  maxCalendars: number | null;
  /** 1 暦月あたりに受けられる確定予約数(レッスン日基準) */
  maxBookingsPerMonth: number | null;
  /** Google カレンダーへの書き込み(イベント作成)可否 */
  calendarWrite: boolean;
  /** キャンセルフィーのオンライン決済(講師の Stripe アカウントで受け取る) */
  onlineFeeCollection: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { maxCalendars: 1, maxBookingsPerMonth: 10, calendarWrite: false, onlineFeeCollection: false },
  pro: { maxCalendars: null, maxBookingsPerMonth: null, calendarWrite: true, onlineFeeCollection: true },
};

export const PLAN_LABELS: Record<Plan, string> = {
  free: 'フリー',
  pro: 'プロ',
};

/**
 * 実効プラン。pro でも支払いが止まっている(past_due / canceled)場合は free の上限に落とす。
 * past_due は Stripe の再請求猶予中なので、直ちに落とさず一定期間は許容する運用も可(docs/business.md 参照)。
 */
export type PlanSubject = Pick<Host, 'plan' | 'subscriptionStatus'> & { orgPlanActive?: boolean };

export function effectivePlan(host: PlanSubject): Plan {
  if (host.plan === 'pro' && host.subscriptionStatus === 'active') return 'pro';
  // 教室プランに所属していればプロ相当
  if (host.orgPlanActive) return 'pro';
  return 'free';
}

/** プロ相当の理由が教室プランだけか(個人契約の案内を出し分ける) */
export function isProViaOrganization(host: PlanSubject): boolean {
  return !(host.plan === 'pro' && host.subscriptionStatus === 'active') && host.orgPlanActive === true;
}

export function limitsFor(host: PlanSubject): PlanLimits {
  return PLAN_LIMITS[effectivePlan(host)];
}

/** slug の形式 */
export const SLUG_PATTERN = /^[a-z0-9-]{3,32}$/;

/** 表示名からは slug を作らない(日本語名が多い)ため、衝突しにくいランダム slug を生成する */
export function randomSlug(length = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/** Stripe の JPY 最低決済額 */
export const MIN_FEE_JPY = 50;

/** 生徒がキャンセルフィーをオンラインで支払えるか */
export function canCollectFeeOnline(
  host: PlanSubject & Pick<Host, 'stripeConnectAccountId' | 'connectChargesEnabled'>,
): boolean {
  return limitsFor(host).onlineFeeCollection && host.stripeConnectAccountId !== null && host.connectChargesEnabled;
}
