import express, { type Router } from 'express';
import { DomainError } from '../../domain/errors.js';
import type { AppDeps } from '../app.js';
import { param, publicHost, slotsQuerySchema, wrap } from '../common.js';

// ---------- 公開(ログイン任意) ----------


export function publicRoutes(deps: AppDeps): Router {
  const r = express.Router();

  // 主催者の一覧は公開しない(各主催者が自分の予約ページ URL を生徒に共有する)
  r.get('/hosts/by-slug/:slug', wrap(async (req, res) => {
    const host = await deps.repos.hosts.findBySlug(param(req, 'slug').toLowerCase());
    if (!host) throw new DomainError('not_found', '予約ページが見つかりません');
    res.json(publicHost(host));
  }));

  r.get('/hosts/:hostId/public', wrap(async (req, res) => {
    const host = await deps.availability.getHost(param(req, 'hostId'));
    res.json(publicHost(host));
  }));

  r.get('/hosts/:hostId/slots', wrap(async (req, res) => {
    const q = slotsQuerySchema.parse(req.query);
    const slots = await deps.availability.listSlots(param(req, 'hostId'), q);
    const host = await deps.availability.getHost(param(req, 'hostId'));
    res.json({ slots, bookingHorizonDays: host.bookingHorizonDays });
  }));

  return r;
}
