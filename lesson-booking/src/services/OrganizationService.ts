import { DomainError } from '../domain/errors.js';
import { SLUG_PATTERN } from '../domain/plans.js';
import type { Host, Organization, OrgInvitation } from '../shared/types.js';
import { safeNotify, type Notifier } from '../notify/Notifier.js';
import type { Clock } from '../repo/InMemoryRepositories.js';
import type { Repositories } from '../repo/Repository.js';
import type { BillingService } from './BillingService.js';

export interface OrgInput {
  name: string;
  slug: string;
  bio?: string | undefined;
}

/**
 * 教室(組織)プラン。
 * - 講師は 1 つの教室にだけ所属できる。作成した講師が管理者(owner)
 * - 管理者はメールアドレスで講師を招待し、招待されたメールでログインした講師が承諾すると所属する
 * - 教室の契約は所属講師数を数量とする席数課金。契約中は所属講師全員がプロ相当(orgPlanActive)
 * - 管理者は所属講師の予約・生徒情報を見られない(各講師の予約は独立)
 */
export class OrganizationService {
  constructor(
    private readonly repos: Repositories,
    private readonly billing: BillingService,
    private readonly notifier: Notifier,
    private readonly clock: Clock,
  ) {}

  async create(owner: Host, input: OrgInput): Promise<Organization> {
    if (owner.organizationId) throw new DomainError('invalid_state', '既に教室に所属しています。新しい教室を作るには先に脱退してください');
    const slug = this.normalizeSlug(input.slug);
    if (await this.repos.organizations.findBySlug(slug)) throw new DomainError('validation', 'この URL 名は既に使われています', { field: 'slug' });
    const org = await this.repos.organizations.create({
      name: input.name.trim(),
      slug,
      bio: input.bio?.trim() ?? '',
      ownerHostId: owner.id,
      subscriptionStatus: 'none',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
    await this.repos.hosts.update(owner.id, { organizationId: org.id, orgPlanActive: false });
    return org;
  }

  /** 所属講師から見た教室の情報。管理者なら招待中の一覧も返す */
  async overview(host: Host): Promise<{ organization: Organization; members: Host[]; invitations: OrgInvitation[]; isOwner: boolean } | null> {
    if (!host.organizationId) return null;
    const organization = await this.mustOrg(host.organizationId);
    const isOwner = organization.ownerHostId === host.id;
    const members = await this.repos.hosts.listByOrganization(organization.id);
    const invitations = isOwner ? await this.repos.invitations.listPendingByOrganization(organization.id) : [];
    return { organization, members, invitations, isOwner };
  }

  async update(owner: Host, orgId: string, patch: Partial<OrgInput>): Promise<Organization> {
    const org = await this.mustOwnedOrg(owner, orgId);
    const next: Partial<Organization> = {};
    if (patch.name !== undefined) next.name = patch.name.trim();
    if (patch.bio !== undefined) next.bio = patch.bio.trim();
    if (patch.slug !== undefined) {
      const slug = this.normalizeSlug(patch.slug);
      if (slug !== org.slug && (await this.repos.organizations.findBySlug(slug))) {
        throw new DomainError('validation', 'この URL 名は既に使われています', { field: 'slug' });
      }
      next.slug = slug;
    }
    return this.repos.organizations.update(org.id, next);
  }

  // ---------- 招待 ----------

  async invite(owner: Host, orgId: string, email: string): Promise<OrgInvitation> {
    const org = await this.mustOwnedOrg(owner, orgId);
    const e = email.trim().toLowerCase();
    const members = await this.repos.hosts.listByOrganization(org.id);
    if (members.some((m) => m.email.toLowerCase() === e)) throw new DomainError('validation', 'この講師は既に所属しています');
    const pending = await this.repos.invitations.listPendingByOrganization(org.id);
    if (pending.some((i) => i.email === e)) throw new DomainError('validation', 'このメールアドレスには既に招待を送っています');
    const invitation = await this.repos.invitations.create({ organizationId: org.id, email: e, status: 'pending', invitedByHostId: owner.id });
    await safeNotify(() => this.notifier.orgInvited({ organization: org, inviter: owner, email: e }));
    return invitation;
  }

  async revokeInvitation(owner: Host, orgId: string, invitationId: string): Promise<void> {
    const org = await this.mustOwnedOrg(owner, orgId);
    const inv = await this.repos.invitations.findById(invitationId);
    if (!inv || inv.organizationId !== org.id) throw new DomainError('not_found', '招待が見つかりません');
    if (inv.status !== 'pending') return;
    await this.repos.invitations.update(inv.id, { status: 'revoked', respondedAt: this.clock.now().toISOString() });
  }

  /** ログイン中のメールアドレス宛ての未回答の招待(教室名つき) */
  async myInvitations(email: string): Promise<(OrgInvitation & { organizationName: string; organizationSlug: string })[]> {
    const list = await this.repos.invitations.listPendingByEmail(email);
    const out = [];
    for (const i of list) {
      const org = await this.repos.organizations.findById(i.organizationId);
      if (org) out.push({ ...i, organizationName: org.name, organizationSlug: org.slug });
    }
    return out;
  }

  async accept(host: Host, invitationId: string): Promise<Organization> {
    const inv = await this.mustMyInvitation(host.email, invitationId);
    if (host.organizationId) throw new DomainError('invalid_state', '既に別の教室に所属しています。先に脱退してください');
    const org = await this.mustOrg(inv.organizationId);
    await this.repos.hosts.update(host.id, { organizationId: org.id, orgPlanActive: org.subscriptionStatus === 'active' });
    await this.repos.invitations.update(inv.id, { status: 'accepted', respondedAt: this.clock.now().toISOString() });
    await this.syncSeats(org);
    return org;
  }

  async decline(email: string, invitationId: string): Promise<void> {
    const inv = await this.mustMyInvitation(email, invitationId);
    await this.repos.invitations.update(inv.id, { status: 'declined', respondedAt: this.clock.now().toISOString() });
  }

  // ---------- 脱退・除名・削除 ----------

  async leave(host: Host): Promise<void> {
    if (!host.organizationId) throw new DomainError('invalid_state', '教室に所属していません');
    const org = await this.mustOrg(host.organizationId);
    if (org.ownerHostId === host.id) {
      throw new DomainError('invalid_state', '管理者は脱退できません。教室を削除してください');
    }
    await this.detach(host.id);
    await this.syncSeats(org);
  }

  async removeMember(owner: Host, orgId: string, memberHostId: string): Promise<void> {
    const org = await this.mustOwnedOrg(owner, orgId);
    if (memberHostId === owner.id) throw new DomainError('validation', '管理者自身は外せません');
    const member = await this.repos.hosts.findById(memberHostId);
    if (!member || member.organizationId !== org.id) throw new DomainError('not_found', '所属講師が見つかりません');
    await this.detach(member.id);
    await this.syncSeats(org);
  }

  /** 教室を削除する。契約は即時解約し、所属講師は全員未所属(個人プランの状態)に戻る */
  async deleteOrganization(owner: Host, orgId: string): Promise<void> {
    const org = await this.mustOwnedOrg(owner, orgId);
    await this.billing.cancelOrgImmediately(org);
    for (const m of await this.repos.hosts.listByOrganization(org.id)) await this.detach(m.id);
    await this.repos.organizations.delete(org.id);
  }

  /** 退会処理から呼ぶ: 管理者なら教室ごと削除、所属講師なら脱退 */
  async handleHostDeletion(host: Host): Promise<void> {
    if (!host.organizationId) return;
    const org = await this.repos.organizations.findById(host.organizationId);
    if (!org) return;
    if (org.ownerHostId === host.id) await this.deleteOrganization(host, org.id);
    else await this.leave(host);
  }

  // ---------- 課金 ----------

  async checkoutUrl(owner: Host, orgId: string, urls: { success: string; cancel: string }): Promise<string> {
    const org = await this.mustOwnedOrg(owner, orgId);
    if (org.subscriptionStatus === 'active') throw new DomainError('invalid_state', '既に教室プランを契約中です');
    const seats = (await this.repos.hosts.listByOrganization(org.id)).length;
    return this.billing.orgCheckoutUrl(org, owner, seats, urls);
  }

  async portalUrl(owner: Host, orgId: string, returnUrl: string): Promise<string> {
    const org = await this.mustOwnedOrg(owner, orgId);
    return this.billing.orgPortalUrl(org, returnUrl);
  }

  // ---------- 公開 ----------

  async publicPage(slug: string): Promise<{ organization: Organization; members: Host[] }> {
    const organization = await this.repos.organizations.findBySlug(slug.toLowerCase());
    if (!organization) throw new DomainError('not_found', '教室のページが見つかりません');
    const members = (await this.repos.hosts.listByOrganization(organization.id)).sort((a, b) =>
      a.id === organization.ownerHostId ? -1 : b.id === organization.ownerHostId ? 1 : a.displayName.localeCompare(b.displayName, 'ja'),
    );
    return { organization, members };
  }

  // ---------- 内部 ----------

  private async detach(hostId: string): Promise<void> {
    await this.repos.hosts.update(hostId, { organizationId: null, orgPlanActive: false });
  }

  private async syncSeats(org: Organization): Promise<void> {
    const current = await this.repos.organizations.findById(org.id);
    if (!current) return;
    const seats = (await this.repos.hosts.listByOrganization(org.id)).length;
    try {
      await this.billing.updateOrgSeats(current, seats);
    } catch (e) {
      // 数量更新の失敗で所属変更を失敗させない。次回の変更時に再同期される
      console.error('[org] 席数の更新に失敗しました', org.id, e);
    }
  }

  private normalizeSlug(slug: string): string {
    const s = slug.trim().toLowerCase();
    if (!SLUG_PATTERN.test(s)) throw new DomainError('validation', 'URL 名は英小文字・数字・ハイフンで3〜32文字にしてください', { field: 'slug' });
    return s;
  }

  private async mustOrg(id: string): Promise<Organization> {
    const org = await this.repos.organizations.findById(id);
    if (!org) throw new DomainError('not_found', '教室が見つかりません');
    return org;
  }

  private async mustOwnedOrg(host: Host, orgId: string): Promise<Organization> {
    const org = await this.mustOrg(orgId);
    if (org.ownerHostId !== host.id) throw new DomainError('forbidden', '教室の管理者のみ操作できます');
    return org;
  }

  private async mustMyInvitation(email: string, invitationId: string): Promise<OrgInvitation> {
    const inv = await this.repos.invitations.findById(invitationId);
    if (!inv || inv.email !== email.toLowerCase()) throw new DomainError('not_found', '招待が見つかりません');
    if (inv.status !== 'pending') throw new DomainError('invalid_state', 'この招待は既に処理されています');
    return inv;
  }
}
