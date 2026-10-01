import { expect, login, logout, registerHost, test, uid } from './fixtures';

test('教室を作成 → 講師を招待 → 登録して承諾 → 契約で所属講師がプロ相当 → 教室ページ', async ({ page }) => {
  const id = uid('org');
  const owner = { email: `${id}-owner@example.com`, name: '田中先生', slug: `${id}-tanaka` };
  const member = { email: `${id}-member@example.com`, name: '鈴木先生', slug: `${id}-suzuki` };
  const orgSlug = `${id}-school`;

  await login(page, owner.email, owner.name);
  await registerHost(page, owner);
  await page.getByRole('button', { name: /^教室/ }).click();
  await page.getByLabel('教室名').fill('さくら音楽教室');
  await page.locator('#org-slug').fill(orgSlug);
  await page.locator('#org-bio').fill('駅前の音楽教室です。');
  await page.getByRole('button', { name: '作成する' }).click();
  await expect(page.getByText('あなたは管理者です')).toBeVisible();
  await page.getByLabel('講師を招待(メールアドレス)').fill(member.email);
  await page.getByRole('button', { name: '招待する' }).click();
  await expect(page.getByText('招待中')).toBeVisible();
  await logout(page);

  await login(page, member.email, member.name);
  await page.getByRole('button', { name: '講師の方' }).click();
  await expect(page.getByText('教室「さくら音楽教室」から招待されています')).toBeVisible();
  await registerHost(page, member);
  await page.getByRole('button', { name: '教室 (1)' }).click();
  await page.getByRole('button', { name: '参加する' }).click();
  await expect(page.getByText('所属講師として参加中')).toBeVisible();
  await logout(page);

  await login(page, owner.email, owner.name);
  await page.getByRole('button', { name: /^教室/ }).click();
  await expect(page.getByText('所属講師(2)')).toBeVisible();
  await page.getByRole('button', { name: '教室プランを契約する' }).click();
  await page.waitForURL(/#\/host/);
  await page.getByRole('button', { name: /^教室/ }).click();
  await expect(page.getByText('教室プラン: 契約中')).toBeVisible();
  await logout(page);

  await login(page, member.email, member.name);
  await page.getByRole('button', { name: '設定' }).click();
  await expect(page.getByText('教室プランで利用中です')).toBeVisible();
  await logout(page);

  await page.goto(`/#/o/${orgSlug}`);
  await expect(page.getByText('駅前の音楽教室です。')).toBeVisible();
  await page.getByRole('link', { name: /鈴木先生/ }).click();
  await expect(page.getByRole('heading', { name: '鈴木先生' })).toBeVisible();
});
