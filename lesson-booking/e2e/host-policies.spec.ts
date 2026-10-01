import { addWeekdayWindows, bookSlot, expect, login, logout, test, uid } from './fixtures';

test('講師のルール(承認制 3 日前から・予約 10 日先まで)が予約ページと判定に反映される', async ({ page }) => {
  const id = uid('pol');
  const teacher = { email: `${id}-t@example.com`, name: '講師A', slug: `${id}-t` };
  await login(page, teacher.email, teacher.name);
  await page.getByRole('button', { name: '講師の方' }).click();
  await page.getByLabel('表示名(生徒に見える名前)').fill(teacher.name);
  await page.locator('#bh-slug').fill(teacher.slug);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '登録する' }).click();
  await page.getByRole('button', { name: '設定' }).click();
  const rules = page.locator('section', { hasText: '予約・キャンセルのルール' });
  await expect(rules.getByText('予約を受け付ける期間(1〜60日)')).toBeVisible();
  await expect(rules.getByText('キャンセル・変更を承認制にする時期(0〜60日)')).toBeVisible();

  // 上限超えはサーバーが拒否
  await page.locator('#h-horizon').fill('61');
  await rules.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '予約を受け付ける期間は1〜60日で指定してください' })).toBeVisible();
  await page.getByRole('alert').getByRole('button', { name: '閉じる' }).click();

  await page.locator('#h-horizon').fill('10');
  await page.locator('#h-threshold').fill('3');
  await rules.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await addWeekdayWindows(page);
  await page.reload();
  await page.getByRole('button', { name: '設定' }).click();
  await expect(page.locator('#h-threshold')).toHaveValue('3');
  await expect(page.locator('#h-horizon')).toHaveValue('10');
  await logout(page);

  await page.goto(`/#/h/${teacher.slug}`);
  await expect(page.getByText('予約は10日先まで')).toBeVisible();
  await expect(page.getByText('開始3日前からのキャンセル・変更は講師の承認制')).toBeVisible();
  const days = await page.getByTestId('slot-day').evaluateAll((els) => els.map((e) => e.getAttribute('data-date')));
  expect(days.at(-1)).toBe('2026-10-09'); // 10/11 09:00 が上限。10/10・11 は週末

  // 5 日後のレッスンは承認制ではない(3 日設定)
  await bookSlot(page, { slug: teacher.slug, date: '2026-10-06', email: `${id}-s@example.com`, name: '生徒B' });
  await page.goto('/#/mine');
  await expect(page.getByRole('heading', { name: '今後の予約' })).toBeVisible();
  await expect(page.getByText('変更は承認制')).toHaveCount(0);
  await page.getByRole('button', { name: 'キャンセル・変更' }).click();
  await expect(page.getByRole('dialog').getByText('開始まで3日以上あるため、すぐに反映されます。')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセルする' }).click();
  await expect(page.getByText('キャンセルしました')).toBeVisible();
});
