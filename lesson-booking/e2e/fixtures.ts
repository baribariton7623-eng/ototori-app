import { test as base, expect, type Page } from '@playwright/test';

export { expect };

/** サーバーの FAKE_NOW と同じ時刻(playwright.config.ts) */
export const NOW = new Date('2026-10-01T00:00:00Z');

/** ブラウザの時計をサーバーに合わせる(タイマーは動いたまま、Date だけ固定) */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(NOW);
    await use(page);
  },
});

/** テストごとに重複しない識別子(同じサーバーを全テストで共有するため) */
export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emailOf(name: string): string {
  return `${name}@example.com`;
}

const dialog = (page: Page) => page.getByRole('dialog');

/** ログインモーダルに入力してログイン(モーダルが開いている前提) */
export async function fillLogin(page: Page, email: string, name = '') {
  await dialog(page).getByLabel('メールアドレス').fill(email);
  await dialog(page).getByLabel('表示名(任意)').fill(name);
  await dialog(page).getByRole('button', { name: 'ログイン' }).click();
  await expect(dialog(page)).toBeHidden();
}

/** トップからログイン */
export async function login(page: Page, email: string, name = '') {
  await page.goto('/');
  await page.getByRole('button', { name: 'ログイン' }).first().click();
  await fillLogin(page, email, name);
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'ログアウト' }).click();
  await expect(page.getByRole('button', { name: 'ログイン' }).first()).toBeVisible();
}

/** ログイン中の生徒アカウントを講師として登録し、設定タブを開く */
export async function registerHost(page: Page, opts: { name: string; slug: string; bio?: string }) {
  await page.getByRole('button', { name: '講師の方' }).click();
  await page.getByLabel('表示名(生徒に見える名前)').fill(opts.name);
  await page.locator('#bh-slug').fill(opts.slug);
  if (opts.bio) await page.locator('#bh-bio').fill(opts.bio);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '登録する' }).click();
  await page.getByRole('button', { name: '設定' }).click();
}

/** 設定タブで平日 10:00-18:00 の営業時間枠を登録 */
export async function addWeekdayWindows(page: Page) {
  const section = page.locator('section', { hasText: '営業時間枠' });
  for (const day of ['月', '火', '水', '木', '金']) {
    await page.getByLabel('曜日').selectOption({ label: day });
    await page.getByLabel('開始', { exact: true }).fill('10:00');
    await page.getByLabel('終了', { exact: true }).fill('18:00');
    await section.getByRole('button', { name: '追加' }).click();
    await expect(section.getByText(`${day} 10:00 – 18:00`)).toBeVisible();
  }
}

/** 講師を登録して営業時間枠まで設定し、ログアウトする */
export async function setupTeacher(page: Page, opts: { email: string; name: string; slug: string; bio?: string }) {
  await login(page, opts.email, opts.name);
  await registerHost(page, opts);
  await addWeekdayWindows(page);
  await logout(page);
}

/** 公開予約ページで指定日(YYYY-MM-DD、JST)の n 番目の枠を、指定の生徒で予約する(未ログイン状態から) */
export async function bookSlot(page: Page, opts: { slug: string; date: string; nth?: number; email: string; name: string }) {
  await page.goto(`/#/h/${opts.slug}`);
  const slot = page.locator(`[data-date="${opts.date}"] button[data-start]`).nth(opts.nth ?? 0);
  const startAt = await slot.getAttribute('data-start');
  await slot.click();
  await page.getByRole('button', { name: 'ログインして予約する' }).click();
  await fillLogin(page, opts.email, opts.name);
  await page.getByRole('button', { name: 'この枠を予約する' }).click();
  await expect(page.getByText('予約しました')).toBeVisible();
  return startAt as string;
}

/** API で直接予約する(他の生徒が先に枠を取った状況を作る) */
export async function bookViaApi(page: Page, opts: { slug: string; startAt: string; email: string }) {
  const host = await (await page.request.get(`/hosts/by-slug/${opts.slug}`)).json();
  const res = await page.request.post('/bookings', {
    headers: { 'x-dev-user-email': opts.email },
    data: { hostId: host.id, startAt: opts.startAt },
  });
  expect(res.status()).toBe(201);
}
