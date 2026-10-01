import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 認証の抽象。
 * - dev: メールアドレスを localStorage に保存し、x-dev-user-email ヘッダで送る(バックエンド AUTH_MODE=dev)
 * - supabase: Supabase Auth(Google ログイン)の access_token を Bearer で送る(AUTH_MODE=supabase)
 */
export type AuthMode = 'dev' | 'supabase';

export const AUTH_MODE: AuthMode = import.meta.env.VITE_AUTH_MODE === 'supabase' ? 'supabase' : 'dev';

const DEV_KEY = 'lesson-booking.dev-user';

// supabase-js は大きいので、supabase モードで初めて使うときに読み込む(dev モードでは読み込まない)
let supabase: Promise<SupabaseClient> | null = null;
function sb(): Promise<SupabaseClient> {
  if (!supabase) {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url || !key) return Promise.reject(new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が未設定です'));
    supabase = import('@supabase/supabase-js').then(({ createClient }) => createClient(url, key));
  }
  return supabase;
}

export interface DevUser {
  email: string;
  name: string;
}

export function getDevUser(): DevUser | null {
  try {
    const raw = localStorage.getItem(DEV_KEY);
    return raw ? (JSON.parse(raw) as DevUser) : null;
  } catch {
    return null;
  }
}

export function setDevUser(user: DevUser | null): void {
  try {
    if (user) localStorage.setItem(DEV_KEY, JSON.stringify(user));
    else localStorage.removeItem(DEV_KEY);
  } catch {
    /* ignore */
  }
}

/** API 呼び出しに付ける認証ヘッダ */
export async function authHeaders(): Promise<Record<string, string>> {
  if (AUTH_MODE === 'dev') {
    const u = getDevUser();
    if (!u) return {};
    return { 'x-dev-user-email': u.email, 'x-dev-user-name': encodeURIComponent(u.name) };
  }
  const { data } = await (await sb()).auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function isSignedIn(): Promise<boolean> {
  if (AUTH_MODE === 'dev') return getDevUser() !== null;
  const { data } = await (await sb()).auth.getSession();
  return data.session !== null;
}

export async function signInWithGoogle(): Promise<void> {
  await (await sb()).auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
}

export async function signOut(): Promise<void> {
  if (AUTH_MODE === 'dev') {
    setDevUser(null);
    return;
  }
  await (await sb()).auth.signOut();
}

/** セッション変化の購読(supabase モードのみ意味を持つ) */
export function onAuthChange(cb: () => void): () => void {
  if (AUTH_MODE === 'dev') return () => {};
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;
  void sb().then((client) => {
    if (cancelled) return;
    const { data } = client.auth.onAuthStateChange(() => cb());
    unsubscribe = () => data.subscription.unsubscribe();
  });
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}
