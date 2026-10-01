import { beforeEach, describe, expect, it } from 'vitest';
import { effectivePlan, limitsFor } from '../src/domain/plans.js';
import type { Host } from '../src/domain/types.js';
import { setupWorld, type TestWorld } from './helpers.js';

let w: TestWorld;
let owner: Host;

async function newHost(email: string, name: string, slug: string): Promise<Host> {
  return w.repos.hosts.create({
    email,
    displayName: name,
    slug,
    bio: '',
    plan: 'free',
    subscriptionStatus: 'none',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    cancellationFeeAmount: null,
    stripeConnectAccountId: null,
    connectChargesEnabled: false,
    feeMethods: ['bank_transfer', 'in_person', 'card'],
    bankTransferInfo: '',
    organizationId: null,
    orgPlanActive: false,
    timezone: 'Asia/Tokyo',
    lessonMinutes: 60,
    rescheduleRangeDays: 7,
    lateChangeThresholdDays: 14,
    bookingHorizonDays: 40,
    minLeadMinutes: 60,
  });
}
const fresh = async (h: Host) => (await w.repos.hosts.findById(h.id))!;

beforeEach(async () => {
  w = await setupWorld();
  owner = await newHost('owner@example.com', '管理者', 'owner-t');
});

describe('教室プラン', () => {
  it('作成すると作成者が管理者として所属する。URL 名は検証・重複不可', async () => {
    await expect(w.organizations.create(owner, { name: '音楽教室', slug: 'NG slug' })).rejects.toMatchObject({ code: 'validation' });
    const org = await w.organizations.create(owner, { name: '音楽教室', slug: 'music-school' });
    expect(org.ownerHostId).toBe(owner.id);
    expect((await fresh(owner)).organizationId).toBe(org.id);
    const other = await newHost('x@example.com', 'X', 'x-t');
    await expect(w.organizations.create(other, { name: '別', slug: 'music-school' })).rejects.toMatchObject({ code: 'validation' });
    await expect(w.organizations.create(await fresh(owner), { name: '二つ目', slug: 'second' })).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('招待 → メール送信 → 招待されたメールの講師だけが承諾できる', async () => {
    const org = await w.organizations.create(owner, { name: '音楽教室', slug: 'music-school' });
    w.mail.clear();
    const inv = await w.organizations.invite(await fresh(owner), org.id, 'Teacher2@Example.com');
    expect(inv.email).toBe('teacher2@example.com');
    expect(w.mail.to('teacher2@example.com')[0]?.subject).toContain('教室「音楽教室」への招待');
    await expect(w.organizations.invite(await fresh(owner), org.id, 'teacher2@example.com')).rejects.toMatchObject({ code: 'validation' });

    const intruder = await newHost('intruder@example.com', 'I', 'intruder');
    await expect(w.organizations.accept(intruder, inv.id)).rejects.toMatchObject({ code: 'not_found' });

    const t2 = await newHost('teacher2@example.com', '講師2', 'teacher-2');
    expect(await w.organizations.myInvitations('teacher2@example.com')).toMatchObject([{ id: inv.id, organizationName: '音楽教室' }]);
    await w.organizations.accept(t2, inv.id);
    expect((await fresh(t2)).organizationId).toBe(org.id);
    expect(await w.organizations.myInvitations('teacher2@example.com')).toHaveLength(0);
    await expect(w.organizations.invite(await fresh(owner), org.id, 'teacher2@example.com')).rejects.toMatchObject({ code: 'validation' });
  });

  it('管理者以外は招待・契約・除名できない', async () => {
    const org = await w.organizations.create(owner, { name: '音楽教室', slug: 'music-school' });
    const t2 = await newHost('teacher2@example.com', '講師2', 'teacher-2');
    const inv = await w.organizations.invite(await fresh(owner), org.id, t2.email);
    await w.organizations.accept(t2, inv.id);
    const member = await fresh(t2);
    await expect(w.organizations.invite(member, org.id, 'z@example.com')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(w.organizations.checkoutUrl(member, org.id, { success: 'x', cancel: 'x' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(w.organizations.removeMember(member, org.id, owner.id)).rejects.toMatchObject({ code: 'forbidden' });
    const ov = await w.organizations.overview(member);
    expect(ov?.isOwner).toBe(false);
    expect(ov?.invitations).toEqual([]);
  });

  it('契約すると所属講師全員がプロ相当になり、席数が所属人数に追従する', async () => {
    const org = await w.organizations.create(owner, { name: '音楽教室', slug: 'music-school' });
    const t2 = await newHost('teacher2@example.com', '講師2', 'teacher-2');
    await w.organizations.accept(t2, (await w.organizations.invite(await fresh(owner), org.id, t2.email)).id);
    expect(effectivePlan(await fresh(t2))).toBe('free');

    const url = await w.organizations.checkoutUrl(await fresh(owner), org.id, { success: 's', cancel: 'c' });
    expect(url).toContain('seats=2');
    await w.billing.activateOrgForDev(org.id);
    expect(effectivePlan(await fresh(owner))).toBe('pro');
    expect(effectivePlan(await fresh(t2))).toBe('pro');
    expect(limitsFor(await fresh(t2)).maxCalendars).toBeNull();

    // 契約中の参加は即プロ、席数 3
    const t3 = await newHost('teacher3@example.com', '講師3', 'teacher-3');
    await w.organizations.accept(t3, (await w.organizations.invite(await fresh(owner), org.id, t3.email)).id);
    expect((await fresh(t3)).orgPlanActive).toBe(true);
    expect(w.billingProvider.seatUpdates.at(-1)).toEqual({ orgId: org.id, seats: 3 });

    // 脱退で席数 2、脱退者はフリーに戻る
    await w.organizations.leave(await fresh(t3));
    expect(effectivePlan(await fresh(t3))).toBe('free');
    expect(w.billingProvider.seatUpdates.at(-1)).toEqual({ orgId: org.id, seats: 2 });

    // 除名で席数 1
    await w.organizations.removeMember(await fresh(owner), org.id, t2.id);
    expect((await fresh(t2)).organizationId).toBeNull();
    expect(w.billingProvider.seatUpdates.at(-1)).toEqual({ orgId: org.id, seats: 1 });

    // 管理者は脱退できない
    await expect(w.organizations.leave(await fresh(owner))).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('支払い遅延・解約で所属講師はフリーに戻る(Webhook は顧客 ID で教室を判別)', async () => {
    const org = await w.organizations.create(owner, { name: '音楽教室', slug: 'music-school' });
    await w.billing.activateOrgForDev(org.id);
    const cus = (await w.repos.organizations.findById(org.id))!.stripeCustomerId!;
    await w.billing.apply({ type: 'subscription_updated', customerId: cus, subscriptionId: 's', status: 'past_due' });
    expect(effectivePlan(await fresh(owner))).toBe('free');
    await w.billing.apply({ type: 'subscription_updated', customerId: cus, subscriptionId: 's', status: 'active' });
    expect(effectivePlan(await fresh(owner))).toBe('pro');
    await w.billing.apply({ type: 'subscription_canceled', customerId: cus, subscriptionId: 's' });
    expect(effectivePlan(await fresh(owner))).toBe('free');
    expect((await w.repos.organizations.findById(org.id))?.subscriptionStatus).toBe('canceled');
    // 個人の契約には影響しない
    expect((await fresh(owner)).plan).toBe('free');
  });

  it('教室を削除すると契約を即時解約し、所属講師は未所属に戻る', async () => {
    const org = await w.organizations.create(owner, { name: '音楽教室', slug: 'music-school' });
    const t2 = await newHost('teacher2@example.com', '講師2', 'teacher-2');
    await w.organizations.accept(t2, (await w.organizations.invite(await fresh(owner), org.id, t2.email)).id);
    await w.billing.activateOrgForDev(org.id);
    await w.organizations.deleteOrganization(await fresh(owner), org.id);
    expect(w.billingProvider.canceledOrgs).toEqual([org.id]);
    expect(await fresh(t2)).toMatchObject({ organizationId: null, orgPlanActive: false });
    expect(await w.repos.organizations.findById(org.id)).toBeNull();
  });

  it('退会: 管理者なら教室ごと削除、所属講師なら脱退して席数を更新', async () => {
    const org = await w.organizations.create(owner, { name: '音楽教室', slug: 'music-school' });
    const t2 = await newHost('teacher2@example.com', '講師2', 'teacher-2');
    const t3 = await newHost('teacher3@example.com', '講師3', 'teacher-3');
    for (const t of [t2, t3]) await w.organizations.accept(t, (await w.organizations.invite(await fresh(owner), org.id, t.email)).id);
    await w.billing.activateOrgForDev(org.id);

    await w.accounts.deleteAccount({ email: t3.email, subject: null, host: await fresh(t3) });
    expect(w.billingProvider.seatUpdates.at(-1)).toEqual({ orgId: org.id, seats: 2 });
    expect(await w.repos.organizations.findById(org.id)).not.toBeNull();

    await w.accounts.deleteAccount({ email: owner.email, subject: null, host: await fresh(owner) });
    expect(await w.repos.organizations.findById(org.id)).toBeNull();
    expect(w.billingProvider.canceledOrgs).toEqual([org.id]);
    expect(await fresh(t2)).toMatchObject({ organizationId: null, orgPlanActive: false });
  });
});
