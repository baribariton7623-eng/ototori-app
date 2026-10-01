import { bookSlot, expect, login, logout, registerHost, addWeekdayWindows, test, uid } from './fixtures';

test('カード決済: 講師がプロ化・金額設定・Stripe 連携 → 生徒がカードで申請 → 承認 → 支払い', async ({ page }) => {
  const id = uid('card');
  const teacher = { email: `${id}-t@example.com`, name: '講師A', slug: `${id}-t` };
  const student = { email: `${id}-s@example.com`, name: '生徒B' };
  await login(page, teacher.email, teacher.name);
  await registerHost(page, teacher);
  await page.getByRole('button', { name: 'プロプランにアップグレード' }).click();
  await page.waitForURL(/#\/host/);
  await page.getByRole('button', { name: '設定' }).click();
  await page.getByLabel('金額(円)').fill('3000');
  await page.locator('section', { hasText: '受け付ける支払い方法' }).getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('保存しました')).toBeVisible();
  await page.getByRole('button', { name: 'Stripe と連携する' }).click();
  await page.waitForURL(/#\/host/);
  await page.getByRole('button', { name: '設定' }).click();
  await expect(page.getByText('受付中')).toBeVisible();
  await addWeekdayWindows(page);
  await logout(page);

  await bookSlot(page, { slug: teacher.slug, date: '2026-10-06', nth: 3, ...student });
  await page.goto('/#/mine');
  await page.getByRole('button', { name: 'キャンセル・変更' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('(3,000円)')).toBeVisible();
  await dialog.getByText('キャンセルフィーを支払う').click();
  await dialog.getByLabel('クレジットカード').check();
  await dialog.getByLabel('主催者へのメッセージ(必須)').fill('急用のためキャンセルさせてください。');
  await dialog.getByRole('button', { name: '申請する' }).click();
  await expect(page.getByText('申請を送信しました')).toBeVisible();
  await logout(page);

  await login(page, teacher.email, teacher.name);
  await page.getByRole('button', { name: 'キャンセルとクレジットカードを承認' }).click();
  await expect(page.getByText('申請はありません')).toBeVisible();
  await logout(page);

  await login(page, student.email, student.name);
  await page.getByRole('button', { name: 'マイ予約' }).click();
  await expect(page.getByText('キャンセルフィー 3,000円')).toBeVisible();
  await page.getByRole('button', { name: 'カードで支払う' }).click();
  await page.waitForURL(/#\/mine/);
  await expect(page.getByText('フィー支払済')).toBeVisible();
});

test('銀行振込で申請 → 承認後に振込先を表示 → 講師が手渡しに変更', async ({ page }) => {
  const id = uid('bank');
  const teacher = { email: `${id}-t@example.com`, name: '講師A', slug: `${id}-t` };
  const student = { email: `${id}-s@example.com`, name: '生徒B' };
  const bank = 'さくら銀行 本店 普通 1234567\n名義: スズキ ハナコ';
  await login(page, teacher.email, teacher.name);
  await registerHost(page, teacher);
  const fee = page.locator('section', { hasText: '受け付ける支払い方法' });
  await page.getByLabel('金額(円)').fill('3000');
  await fee.getByLabel('クレジットカード').uncheck();
  await page.getByLabel('振込先(承認後、その生徒にだけ表示されます)').fill(bank);
  await fee.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('保存しました')).toBeVisible();
  await addWeekdayWindows(page);
  await logout(page);

  await bookSlot(page, { slug: teacher.slug, date: '2026-10-06', nth: 3, ...student });
  await page.goto('/#/mine');
  await page.getByRole('button', { name: 'キャンセル・変更' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('キャンセルフィーを支払う').click();
  await expect(dialog.getByLabel('クレジットカード')).toHaveCount(0);
  await dialog.getByLabel('銀行振込').check();
  await dialog.getByLabel('主催者へのメッセージ(必須)').fill('急用のためキャンセルさせてください。');
  await dialog.getByRole('button', { name: '申請する' }).click();
  await expect(page.getByText('(銀行振込)')).toBeVisible();
  await logout(page);

  await login(page, teacher.email, teacher.name);
  await expect(page.getByText('支払い方法: 銀行振込')).toBeVisible();
  await page.getByRole('button', { name: 'キャンセルと銀行振込を承認' }).click();
  await expect(page.getByText('申請はありません')).toBeVisible();
  await logout(page);

  await login(page, student.email, student.name);
  await page.getByRole('button', { name: 'マイ予約' }).click();
  await expect(page.getByText('名義: スズキ ハナコ')).toBeVisible();
  await logout(page);

  await login(page, teacher.email, teacher.name);
  await page.getByRole('button', { name: '予約一覧' }).click();
  await page.getByLabel('支払い方法を変更').selectOption({ label: '次回レッスン時に手渡し' });
  await expect(page.getByLabel('支払い方法を変更')).toHaveValue('in_person');
  await logout(page);

  await login(page, student.email, student.name);
  await page.getByRole('button', { name: 'マイ予約' }).click();
  await expect(page.getByText('次回のレッスン時に講師へお支払いください。')).toBeVisible();
  await expect(page.getByText('名義: スズキ ハナコ')).toHaveCount(0);
});
