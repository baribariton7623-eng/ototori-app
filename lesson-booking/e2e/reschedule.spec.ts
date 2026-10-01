import { bookSlot, bookViaApi, expect, login, logout, setupTeacher, test, uid } from './fixtures';

test('第1〜第3希望で振替を申請 → 第1希望が他の生徒に埋まる → 講師が第2希望で承認', async ({ page }) => {
  const id = uid('rs');
  const teacher = { email: `${id}-t@example.com`, name: '講師A', slug: `${id}-t` };
  const student = { email: `${id}-s@example.com`, name: '生徒B' };
  await setupTeacher(page, teacher);
  await bookSlot(page, { slug: teacher.slug, date: '2026-10-06', nth: 2, ...student });
  await page.goto('/#/mine');
  await page.getByRole('button', { name: 'キャンセル・変更' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('1週間以内の別日に振替を希望する').click();
  await dialog.getByLabel('主催者へのメッセージ(必須)').fill('出張のため振り替えたいです。');

  // 前後 7 日以内(9/29〜10/13)のうち、今日以降の枠だけが出る
  const days = await dialog.getByTestId('slot-day').evaluateAll((els) => els.map((e) => e.getAttribute('data-date')));
  expect(days[0]! >= '2026-10-01').toBe(true);
  expect(days.at(-1)! <= '2026-10-13').toBe(true);

  const pick = (date: string, n: number) => dialog.locator(`[data-date="${date}"] button[data-start]`).nth(n);
  const first = await pick('2026-10-07', 0).getAttribute('data-start');
  await pick('2026-10-07', 0).click();
  await pick('2026-10-08', 1).click();
  await pick('2026-10-09', 2).click();
  const list = dialog.getByRole('list', { name: '選択中の希望日時' });
  await expect(list.locator('li')).toHaveCount(3);
  await pick('2026-10-12', 0).click(); // 4 つ目は選べない
  await expect(list.locator('li')).toHaveCount(3);
  await expect(dialog.getByText('第3希望まで選びました')).toBeVisible();
  await dialog.getByRole('button', { name: '申請する' }).click();
  await expect(page.getByText('申請を送信しました')).toBeVisible();
  await expect(page.getByText('第3希望:')).toBeVisible();
  await logout(page);

  await bookViaApi(page, { slug: teacher.slug, startAt: first!, email: `${id}-other@example.com` });

  await login(page, teacher.email, teacher.name);
  await expect(page.getByText('振替先を選んで承認')).toBeVisible();
  await expect(page.getByText('埋まっています')).toBeVisible();
  await page.getByRole('button', { name: '第2希望で振替を承認' }).click();
  await expect(page.getByText('申請はありません')).toBeVisible();
});

test('講師の振替期間(3 日)に候補が限られ、選択中の枠が埋まると一覧と希望から外れる', async ({ page }) => {
  const id = uid('rr');
  const teacher = { email: `${id}-t@example.com`, name: '講師A', slug: `${id}-t` };
  const student = { email: `${id}-s@example.com`, name: '生徒B' };
  await login(page, teacher.email, teacher.name);
  await page.getByRole('button', { name: '講師の方' }).click();
  await page.getByLabel('表示名(生徒に見える名前)').fill(teacher.name);
  await page.locator('#bh-slug').fill(teacher.slug);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '登録する' }).click();
  await page.getByRole('button', { name: '設定' }).click();
  const rules = page.locator('section', { hasText: '予約・キャンセルのルール' });
  await page.locator('#h-range').fill('3');
  await rules.getByRole('button', { name: '保存' }).click();
  const { addWeekdayWindows } = await import('./fixtures');
  await addWeekdayWindows(page);
  await logout(page);

  await bookSlot(page, { slug: teacher.slug, date: '2026-10-02', nth: 1, ...student });
  await page.goto('/#/mine');
  await page.getByRole('button', { name: 'キャンセル・変更' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('3日以内の別日に振替を希望する').click();
  await expect(dialog.getByText('元の日から前後3日以内')).toBeVisible();
  const days = await dialog.getByTestId('slot-day').evaluateAll((els) => els.map((e) => e.getAttribute('data-date')));
  expect(days.every((d) => d! <= '2026-10-05')).toBe(true);

  // 10/2 11:00 の前後 3 日 = 10/5 11:00 まで。10/5 は 10:00・11:00 の 2 枠だけ
  await expect(dialog.locator('[data-date="2026-10-05"] button[data-start]')).toHaveCount(2);
  const target = dialog.locator('[data-date="2026-10-01"] button[data-start]').nth(2);
  const startAt = await target.getAttribute('data-start');
  await dialog.locator('[data-date="2026-10-05"] button[data-start]').nth(0).click();
  await target.click();
  await expect(dialog.getByRole('list', { name: '選択中の希望日時' }).locator('li')).toHaveCount(2);

  await bookViaApi(page, { slug: teacher.slug, startAt: startAt!, email: `${id}-other@example.com` });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(dialog.getByText('予約できなくなったため、希望から外しました')).toBeVisible();
  await expect(dialog.getByRole('list', { name: '選択中の希望日時' }).locator('li')).toHaveCount(1);
  await expect(dialog.locator(`button[data-start="${startAt}"]`)).toHaveCount(0);

  await dialog.getByLabel('主催者へのメッセージ(必須)').fill('振替をお願いします。');
  await dialog.getByRole('button', { name: '申請する' }).click();
  await expect(page.getByText('申請を送信しました')).toBeVisible();
});
