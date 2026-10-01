/**
 * ルーター(routes/*.ts)で共有する入力スキーマの部品、応答の整形、ハンドラの補助、エラー応答
 */
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { DomainError } from '../domain/errors.js';
import { availableFeeMethods, canCollectFeeOnline, SLUG_PATTERN } from '../domain/plans.js';
import type { Host } from '../shared/types.js';
import { DEFAULT_RESCHEDULE_RANGE_DAYS, isLateChange, LATE_CHANGE_THRESHOLD_DAYS } from '../domain/rules.js';
import type { Repositories } from '../repo/Repository.js';
import { timingSafeEqual } from 'node:crypto';

// 入力スキーマの共通部品

export const isoDate = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

/** 空き枠一覧の期間(省略時は予約受付ウィンドウ全体) */
export const slotsQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const slugSchema = z.string().trim().toLowerCase().regex(SLUG_PATTERN, '英小文字・数字・ハイフンで3〜32文字');

export const billingUrlsSchema = z.object({
  successUrl: z.url(),
  cancelUrl: z.url(),
});

export const returnUrlSchema = z.object({ returnUrl: z.url() });

export function publicHost(h: Host) {
  return {
    id: h.id,
    slug: h.slug,
    displayName: h.displayName,
    bio: h.bio,
    timezone: h.timezone,
    lessonMinutes: h.lessonMinutes,
    rescheduleRangeDays: h.rescheduleRangeDays,
    lateChangeThresholdDays: h.lateChangeThresholdDays,
    bookingHorizonDays: h.bookingHorizonDays,
    cancellationFeeAmount: h.cancellationFeeAmount,
    onlineFeePayment: canCollectFeeOnline(h),
    /** 生徒が今選べる支払い方法(振込先そのものは公開しない) */
    feeMethods: availableFeeMethods(h),
  };
}

export type FeeFields = { cancellationFeeStatus: string; cancellationFeeAmount: number | null; cancellationFeeMethod: string | null };

/** 予約一覧に含める過去分の日数(既定)。キャンセルフィー未払いの予約は期間に関係なく返す */
export const PAST_BOOKINGS_DAYS = 60;

/** ?since=ISO日時 で過去分の起点を変えられる。既定は PAST_BOOKINGS_DAYS 日前 */
export function listSince(req: Request, now: Date): Date {
  const q = req.query.since;
  if (typeof q === 'string' && q) return isoDate.parse(q);
  return new Date(now.getTime() - PAST_BOOKINGS_DAYS * 86_400_000);
}

/** 生徒をまとめて取得し、ID → 講師に見せる項目 */
export async function studentsById(repos: Repositories, ids: readonly string[]) {
  const list = await repos.students.findByIds([...new Set(ids)]);
  return new Map(list.map((s) => [s.id, { id: s.id, email: s.email, name: s.name }] as const));
}

/** この予約の未払いキャンセルフィーをオンラインで払えるか */
export function feePayable(b: FeeFields, host: Host | null): boolean {
  return (
    b.cancellationFeeStatus === 'pending' &&
    b.cancellationFeeMethod === 'card' &&
    b.cancellationFeeAmount !== null &&
    host !== null &&
    canCollectFeeOnline(host)
  );
}

/** 生徒向け: 支払い方法ごとに必要な情報。振込先は、振込で承認された未払いの予約にだけ付ける */
export function feeInfo(b: FeeFields, host: Host | null): { feePayableOnline: boolean; bankTransferInfo?: string } {
  const out: { feePayableOnline: boolean; bankTransferInfo?: string } = { feePayableOnline: feePayable(b, host) };
  if (b.cancellationFeeStatus === 'pending' && b.cancellationFeeMethod === 'bank_transfer' && host?.bankTransferInfo.trim()) {
    out.bankTransferInfo = host.bankTransferInfo.trim();
  }
  return out;
}

/** 予約に「今の時点で直前変更扱いか」と講師のルールを付ける(クライアントの文言分岐用) */
export function decorate<T extends { startAt: string; status: string }>(booking: T, now: Date, host: Host | null) {
  const threshold = host?.lateChangeThresholdDays ?? LATE_CHANGE_THRESHOLD_DAYS;
  return {
    ...booking,
    requiresApprovalToChange: booking.status === 'confirmed' && isLateChange(new Date(booking.startAt), now, threshold),
    lateChangeThresholdDays: threshold,
    rescheduleRangeDays: host?.rescheduleRangeDays ?? DEFAULT_RESCHEDULE_RANGE_DAYS,
  };
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function header(req: Request, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

export function param(req: Request, name: string): string {
  const v = req.params[name];
  if (typeof v !== 'string' || v.length === 0) throw new DomainError('validation', `パラメータ ${name} が不正です`);
  return v;
}

export type Handler = (req: Request, res: Response) => Promise<void>;

export function wrap(fn: Handler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof DomainError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({
      error: {
        code: 'validation',
        message: '入力内容に誤りがあります',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }
  if (isBodyParseError(err)) {
    res.status(400).json({ error: { code: 'validation', message: 'JSON の形式が不正です' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'internal', message: 'サーバー内部でエラーが発生しました' } });
}

export function isBodyParseError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed';
}
