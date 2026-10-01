import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * OAuth の state パラメータ用の署名付きトークン。
 * Google から戻ってくるリクエストにはログイン情報が付かないため、state の中身(講師 ID)を
 * サーバーの鍵で署名し、偽造・使い回し(有効期限切れ)を防ぐ。
 */
export interface StatePayload {
  /** 対象の講師 */
  sub: string;
  /** 有効期限(UNIX 秒) */
  exp: number;
  /** 毎回変わる値(同じ URL の再利用を見分けやすくする) */
  n: string;
}

export function signState(secret: string, sub: string, now: Date, ttlSeconds = 600): string {
  const payload: StatePayload = { sub, exp: Math.floor(now.getTime() / 1000) + ttlSeconds, n: randomBytes(8).toString('hex') };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${mac(secret, body)}`;
}

/** 署名と有効期限を確かめて講師 ID を返す。不正なら null */
export function verifyState(secret: string, state: string, now: Date): string | null {
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  const expected = Buffer.from(mac(secret, body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<StatePayload>;
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 < now.getTime()) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

function mac(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}
