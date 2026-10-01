import express, { type Router } from 'express';
import { z } from 'zod';
import { DomainError } from '../../domain/errors.js';
import { requireHost } from '../auth.js';
import type { AppDeps } from '../app.js';
import { param, wrap } from '../common.js';

// ---------- Google OAuth 連携(主催者) ----------

export function googleRoutes(deps: AppDeps): Router {
  const r = express.Router();
  const google = deps.google;

  r.get('/hosts/:hostId/google/connect', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    if (!google) throw new DomainError('calendar_error', 'CALENDAR=google が無効です');
    res.json({ url: google.authUrl(host.id, deps.clock.now()) });
  }));

  r.get('/hosts/:hostId/google/status', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    const token = await deps.repos.googleCredentials.getRefreshToken(host.id);
    res.json({ connected: token !== null });
  }));

  r.delete('/hosts/:hostId/google', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    if (google) await google.revoke(host.id);
    else await deps.repos.googleCredentials.clear(host.id);
    res.status(204).end();
  }));

  // Google からのリダイレクト先。state に hostId が入る
  r.get('/google/callback', wrap(async (req, res) => {
    if (!google) throw new DomainError('calendar_error', 'CALENDAR=google が無効です');
    const q = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(req.query);
    // state は署名付き。偽造・期限切れは handleCallback が拒否する
    const hostId = await google.handleCallback(q.state, q.code, deps.clock.now());
    if (!(await deps.repos.hosts.findById(hostId))) throw new DomainError('not_found', '主催者が見つかりません');
    res.type('text/plain').send('Google カレンダーと連携しました。この画面は閉じてかまいません。');
  }));

  return r;
}
