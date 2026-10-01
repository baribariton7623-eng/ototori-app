import { bookSlot, expect, login, logout, setupTeacher, test, uid } from './fixtures';

test('休講 → 生徒の退会(予約が残っていると拒否)→ 講師の退会', async ({ page }) => {
  const id = uid('del');
  const teacher = { email: `${id}-t@example.com`, name: '講師A', slug: `${id}-t` };
  const s1 = { email: `${id}-s1@example.com`, name: '生徒B' };
  const s2 = { email: `${id}-s2@example.com`, name: '生徒C' };
  await setupTeacher(page, teacher);
  await bookSlot(page, { slug: teacher.slug, date: '2026-10-06', nth: 1, ...s1 });
  await logout(page);
  await bookSlot(page, { slug: teacher.slug, date: '2026-10-06', nth: 3, ...s2 });
  await logout(page);

  // 講師が 1 件を休講にする(メッセージ必須)
  await login(page, teacher.email, teacher.name);
  await page.getByRole('button', { name: '予約一覧' }).click();
  await expect(page.getByText('今後の予約(2)')).toBeVisible();
  await page.getByRole('button', { name: '休講にする' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: '休講にする' })).toBeDisabled();
  await dialog.getByLabel('生徒へのメッセージ(必須)').fill('体調不良のため休講とさせてください。');
  await dialog.getByRole('button', { name: '休講にする' }).click();
  await expect(page.getByText('今後の予約(1)')).toBeVisible();
  await logout(page);

  // 予約が残っている生徒 C は退会できない
  await login(page, s2.email, s2.name);
  await page.getByRole('button', { name: 'マイ予約' }).click();
  await page.getByRole('button', { name: '退会する' }).click();
  await dialog.getByLabel('確認入力').fill(s2.email);
  await dialog.getByRole('button', { name: '退会する' }).click();
  await expect(dialog.getByText(/今後の予約が1件あります/)).toBeVisible();
  await dialog.getByRole('button', { name: 'やめる' }).click();
  await logout(page);

  // 休講された生徒 B は退会できる
  await login(page, s1.email, s1.name);
  await page.getByRole('button', { name: 'マイ予約' }).click();
  await page.getByRole('button', { name: '退会する' }).click();
  await dialog.getByLabel('確認入力').fill(s1.email);
  await dialog.getByRole('button', { name: '退会する' }).click();
  await expect(page.getByText('退会しました')).toBeVisible();

  // 講師の退会(URL 名で確認)
  await login(page, teacher.email, teacher.name);
  await page.getByRole('button', { name: '設定' }).click();
  await page.getByRole('button', { name: '退会する' }).click();
  const confirm = dialog.getByRole('button', { name: '退会する' });
  await dialog.getByLabel('確認入力').fill('wrong');
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('確認入力').fill(teacher.slug);
  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('直前キャンセルに、')).toBeVisible();
  await page.goto(`/#/h/${teacher.slug}`);
  await expect(page.getByText('予約ページが見つかりません')).toBeVisible();
});
