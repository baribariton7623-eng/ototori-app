import type { Host, Plan } from './types.js';

/** プランごとの上限。null は無制限 */
export interface PlanLimits {
  /** 連携できるカレンダー数 */
  maxCalendars: number | null;
  /** 1 暦月あたりに受けられる確定予約数(レッスン日基準) */
  maxBookingsPerMonth: number | null;
  /** Google カレンダーへの書き込み(イベント作成)可否 */
  calendarWrite: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { maxCalendars: 1, maxBookingsPerMonth: 10, calendarWrite: false },
  pro: { maxCalendars: null, maxBookingsPerMonth: null, calendarWrite: true },
};

export const PLAN_LABELS: Record<Plan, string> = {
  free: 'フリー',
  pro: 'プロ',
};

/**
 * 実効プラン。pro でも支払いが止まっている(past_due / canceled)場合は free の上限に落とす。
 * past_due は Stripe の再請求猶予中なので、直ちに落とさず一定期間は許容する運用も可(docs/business.md 参照)。
 */
export function effectivePlan(host: Pick<Host, 'plan' | 'subscriptionStatus'>): Plan {
  if (host.plan === 'pro' && host.subscriptionStatus === 'active') return 'pro';
  return 'free';
}

export function limitsFor(host: Pick<Host, 'plan' | 'subscriptionStatus'>): PlanLimits {
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
