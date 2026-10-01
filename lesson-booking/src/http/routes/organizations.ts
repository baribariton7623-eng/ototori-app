import express, { type Router } from 'express';
import { z } from 'zod';
import { requireHost, requirePrincipal } from '../auth.js';
import type { AppDeps } from '../app.js';
import { billingUrlsSchema, param, publicHost, returnUrlSchema, slugSchema, wrap } from '../common.js';

// ---------- 教室(組織)プラン ----------

const orgSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: slugSchema,
  bio: z.string().trim().max(2000).optional(),
});

export function organizationRoutes(deps: AppDeps): Router {
  const r = express.Router();
  const orgs = deps.organizations;

  // 公開: 教室ページ(所属講師の一覧)
  r.get('/orgs/by-slug/:slug', wrap(async (req, res) => {
    const { organization, members } = await orgs.publicPage(param(req, 'slug'));
    res.json({ slug: organization.slug, name: organization.name, bio: organization.bio, teachers: members.map(publicHost) });
  }));

  // 自分宛ての招待(講師登録前でも見られる)
  r.get('/me/invitations', wrap(async (req, res) => {
    const p = requirePrincipal(req);
    res.json(await orgs.myInvitations(p.email));
  }));

  r.post('/invitations/:id/accept', wrap(async (req, res) => {
    const host = requireHost(req);
    res.json(await orgs.accept(host, param(req, 'id')));
  }));

  r.post('/invitations/:id/decline', wrap(async (req, res) => {
    const p = requirePrincipal(req);
    await orgs.decline(p.email, param(req, 'id'));
    res.status(204).end();
  }));

  r.post('/orgs', wrap(async (req, res) => {
    const host = requireHost(req);
    res.status(201).json(await orgs.create(host, orgSchema.parse(req.body)));
  }));

  // 所属中の教室。管理者には所属講師のメールと招待中の一覧も返す
  r.get('/me/organization', wrap(async (req, res) => {
    const host = requireHost(req);
    const ov = await orgs.overview(host);
    if (!ov) {
      res.json(null);
      return;
    }
    res.json({
      organization: ov.organization,
      isOwner: ov.isOwner,
      publicUrl: `${deps.appBaseUrl}/#/o/${ov.organization.slug}`,
      members: ov.members.map((m) => ({
        ...publicHost(m),
        email: ov.isOwner ? m.email : undefined,
        isOwner: m.id === ov.organization.ownerHostId,
      })),
      invitations: ov.invitations,
    });
  }));

  r.post('/me/organization/leave', wrap(async (req, res) => {
    await orgs.leave(requireHost(req));
    res.status(204).end();
  }));

  r.patch('/orgs/:orgId', wrap(async (req, res) => {
    const body = orgSchema.partial().parse(req.body);
    const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
    res.json(await orgs.update(requireHost(req), param(req, 'orgId'), patch));
  }));

  r.delete('/orgs/:orgId', wrap(async (req, res) => {
    await orgs.deleteOrganization(requireHost(req), param(req, 'orgId'));
    res.status(204).end();
  }));

  r.post('/orgs/:orgId/invitations', wrap(async (req, res) => {
    const body = z.object({ email: z.email('メールアドレスの形式が正しくありません') }).parse(req.body);
    res.status(201).json(await orgs.invite(requireHost(req), param(req, 'orgId'), body.email));
  }));

  r.delete('/orgs/:orgId/invitations/:id', wrap(async (req, res) => {
    await orgs.revokeInvitation(requireHost(req), param(req, 'orgId'), param(req, 'id'));
    res.status(204).end();
  }));

  r.delete('/orgs/:orgId/members/:hostId', wrap(async (req, res) => {
    await orgs.removeMember(requireHost(req), param(req, 'orgId'), param(req, 'hostId'));
    res.status(204).end();
  }));

  r.post('/orgs/:orgId/billing/checkout', wrap(async (req, res) => {
    const body = billingUrlsSchema.parse(req.body);
    res.json({ url: await orgs.checkoutUrl(requireHost(req), param(req, 'orgId'), { success: body.successUrl, cancel: body.cancelUrl }) });
  }));

  r.post('/orgs/:orgId/billing/portal', wrap(async (req, res) => {
    const body = returnUrlSchema.parse(req.body);
    res.json({ url: await orgs.portalUrl(requireHost(req), param(req, 'orgId'), body.returnUrl) });
  }));

  if (deps.fakeBilling) {
    r.get('/billing/fake/org-activate', wrap(async (req, res) => {
      const q = z.object({ orgId: z.string(), redirect: z.string() }).parse(req.query);
      await deps.billing.activateOrgForDev(q.orgId);
      res.redirect(q.redirect);
    }));
    r.get('/billing/fake/org-cancel', wrap(async (req, res) => {
      const q = z.object({ orgId: z.string(), redirect: z.string() }).parse(req.query);
      await deps.billing.cancelOrgForDev(q.orgId);
      res.redirect(q.redirect);
    }));
  }

  return r;
}
