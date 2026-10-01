import { describe, expect, it } from 'vitest';
import { loadConfig, productionProblems } from '../src/config.js';

const prodSafe = {
  NODE_ENV: 'production',
  AUTH_MODE: 'supabase',
  STORAGE: 'supabase',
  BILLING: 'stripe',
  CALENDAR: 'google',
  MAIL: 'resend',
  APP_BASE_URL: 'https://lessons.example.jp',
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  SUPABASE_JWT_SECRET: 's',
  GOOGLE_CLIENT_ID: 'g',
  GOOGLE_CLIENT_SECRET: 'g',
  OAUTH_STATE_SECRET: 'x'.repeat(32),
  RESEND_API_KEY: 'r',
  MAIL_FROM: 'x <noreply@example.jp>',
  STRIPE_SECRET_KEY: 'sk',
  STRIPE_WEBHOOK_SECRET: 'wh',
  STRIPE_PRICE_ID_PRO: 'price',
  STRIPE_CONNECT_WEBHOOK_SECRET: 'whc',
  CRON_SECRET: 'cron',
};

describe('本番の安全装置', () => {
  it('開発時(既定)は dev 設定のまま起動できる', () => {
    expect(() => loadConfig({})).not.toThrow();
  });

  it('本番で必要な設定がそろっていれば起動でき、警告もない', () => {
    expect(() => loadConfig(prodSafe)).not.toThrow();
    expect(productionProblems(loadConfig(prodSafe)).warnings).toEqual([]);
  });

  it('本番で環境変数を設定し忘れる(= dev 認証・メモリ保存・課金の仮実装)と起動を拒否する', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', APP_BASE_URL: 'https://x.example' })).toThrow(/AUTH_MODE=dev は使えません/);
    try {
      loadConfig({ NODE_ENV: 'production', APP_BASE_URL: 'https://x.example' });
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('STORAGE=memory は使えません');
      expect(msg).toContain('BILLING=fake は使えません');
    }
  });

  it('本番では FAKE_NOW と http の APP_BASE_URL を拒否する', () => {
    expect(() => loadConfig({ ...prodSafe, FAKE_NOW: '2026-10-01T00:00:00Z' })).toThrow(/FAKE_NOW/);
    expect(() => loadConfig({ ...prodSafe, APP_BASE_URL: 'http://lessons.example.jp' })).toThrow(/https/);
  });

  it('機能が動かない設定は警告にとどめる', () => {
    const cfg = loadConfig({ ...prodSafe, CALENDAR: 'fake', MAIL: 'console', CRON_SECRET: '' });
    const { errors, warnings } = productionProblems(cfg);
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(3);
  });

  it('本番で Google 連携を使うなら、32 文字以上の OAUTH_STATE_SECRET が必要', () => {
    expect(() => loadConfig({ ...prodSafe, OAUTH_STATE_SECRET: '' })).toThrow(/OAUTH_STATE_SECRET/);
    expect(() => loadConfig({ ...prodSafe, OAUTH_STATE_SECRET: 'short' })).toThrow(/OAUTH_STATE_SECRET/);
  });

  it('FAKE_NOW の形式が不正なら起動しない', () => {
    expect(() => loadConfig({ FAKE_NOW: 'not-a-date' })).toThrow(/FAKE_NOW/);
  });
});
