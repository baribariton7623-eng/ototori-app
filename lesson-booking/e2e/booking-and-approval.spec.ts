import { bookSlot, expect, login, logout, setupTeacher, test, uid } from './fixtures';

test('予約 → 直前キャンセル申請(フィー・手渡し)→ 講師が承認 → 入金確認', async ({ page }) => {
  const id = uid('ba');
  const teacher = { email: `${id}-t@example.com`, name: '講師A', slug: `${id}-t` };
  const student = { email: `${id}-s@example.com`, name: '生徒B' };
  await setupTeacher(page, teacher);

  // 10/6 は開始まで 5 日 → 承認制
  await bookSlot(page, { slug: teacher.slug, date: '2026-10-06', nth: 2, ...student });
  await page.goto('/#/mine');
  await expect(page.getByText('変更は承認制')).toBeVisible();
  await page.getByRole('button', { name: 'キャンセル・変更' }).click();
  const dialog = page.getByRole('dialog');
  const submit = dialog.getByRole('button', { name: '申請する' });
  await expect(submit).toBeDisabled();
  await dialog.getByText('キャンセルフィーを支払う').click();
  await dialog.getByLabel('次回レッスン時に手渡し').check();
  await dialog.getByLabel('主催者へのメッセージ(必須)').fill('体調不良のためお休みします。');
  await submit.click();
  await expect(page.getByText('申請を送信しました')).toBeVisible();
  await expect(page.getByText('承認待ち').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'キャンセル・変更' })).toBeDisabled();
  await logout(page);

  await login(page, teacher.email, teacher.name);
  await expect(page.getByRole('button', { name: /承認待ち \(1\)/ })).toBeVisible();
  await expect(page.getByText('体調不良のためお休みします。')).toBeVisible();
  await page.getByPlaceholder('生徒への返信メモ(任意)').fill('承知しました。');
  await page.getByRole('button', { name: 'キャンセルと次回レッスン時に手渡しを承認' }).click();
  await expect(page.getByText('申請はありません')).toBeVisible();
  await page.getByRole('button', { name: '予約一覧' }).click();
  await page.getByRole('button', { name: 'フィー入金を確認' }).click();
  await expect(page.getByText('フィー支払済')).toBeVisible();
  await logout(page);

  await login(page, student.email, student.name);
  await page.getByRole('button', { name: 'マイ予約' }).click();
  await expect(page.getByText('フィー支払済')).toBeVisible();
  await page.getByText('申請履歴(1)').click();
  await expect(page.getByText('主催者: 承知しました。')).toBeVisible();
});

test('猶予のある予約は即時キャンセルできる', async ({ page }) => {
  const id = uid('im');
  const teacher = { email: `${id}-t@example.com`, name: '講師', slug: `${id}-t` };
  await setupTeacher(page, teacher);
  await bookSlot(page, { slug: teacher.slug, date: '2026-10-20', email: `${id}-s@example.com`, name: '生徒' });
  await page.goto('/#/mine');
  await expect(page.getByText('変更は承認制')).toHaveCount(0);
  await page.getByRole('button', { name: 'キャンセル・変更' }).click();
  await expect(page.getByRole('dialog').getByText('開始まで2週間以上あるため、すぐに反映されます。')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセルする' }).click();
  await expect(page.getByText('キャンセルしました')).toBeVisible();
});
