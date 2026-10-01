import { expect, login, test, uid } from './fixtures';

test('LP と法務ページ(実パス)が表示され、運営者情報の未設定が分かる', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('直前キャンセルに、')).toBeVisible();
  for (const [path, title] of [
    ['/terms', '利用規約'],
    ['/privacy', 'プライバシーポリシー'],
    ['/tokushoho', '特定商取引法に基づく表記'],
  ] as const) {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  }
  await expect(page.getByText('【未設定: VITE_OPERATOR_NAME】').first()).toBeVisible();
  await page.goto('/privacy');
  await expect(page.getByText('Limited Use').first()).toBeVisible();
});

test('講師登録は規約への同意が必要', async ({ page }) => {
  await login(page, `${uid('t')}@example.com`, '講師');
  await page.getByRole('button', { name: '講師の方' }).click();
  await page.getByLabel('表示名(生徒に見える名前)').fill('講師');
  const register = page.getByRole('button', { name: '登録する' });
  await expect(register).toBeDisabled();
  await page.getByRole('checkbox').check();
  await expect(register).toBeEnabled();
});

test('存在しない予約ページ', async ({ page }) => {
  await page.goto(`/#/h/${uid('none')}`);
  await expect(page.getByText('予約ページが見つかりません')).toBeVisible();
});
