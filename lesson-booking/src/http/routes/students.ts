import express, { type Router } from 'express';
import { z } from 'zod';
import { FEE_METHODS, LATE_CHANGE_OPTIONS } from '../../domain/rules.js';
import { requireStudent } from '../auth.js';
import type { AppDeps } from '../app.js';
import { decorate, feeInfo, isoDate, listSince, param, wrap } from '../common.js';

// ---------- 生徒用 ----------

const successCancelSchema = z.object({ successUrl: z.url(), cancelUrl: z.url() });
const createBookingSchema = z.object({
  hostId: z.string().min(1),
  startAt: isoDate,
  note: z.string().trim().max(1000).optional(),
});
const changeSchema = z.object({
  kind: z.enum(['cancel', 'reschedule']),
  message: z.string().trim().max(2000).optional(),
  option: z.enum(LATE_CHANGE_OPTIONS).optional(),
  /** 振替の希望日時(第1希望から順、最大 3 件) */
  proposedStartAts: z.array(isoDate).max(3).optional(),
  /** 旧形式(希望日時 1 件)。proposedStartAts と同時には使わない */
  proposedStartAt: isoDate.optional(),
  feeMethod: z.enum(FEE_METHODS).optional(),
});

export function studentRoutes(deps: AppDeps): Router {
  const r = express.Router();
  const { repos } = deps;

  r.post('/bookings', wrap(async (req, res) => {
    const student = await requireStudent(req, repos);
    const body = createBookingSchema.parse(req.body);
    const booking = await deps.bookings.createBooking({ hostId: body.hostId, student, startAt: body.startAt, note: body.note });
    res.status(201).json(decorate(booking, deps.clock.now(), await repos.hosts.findById(booking.hostId)));
  }));

  r.get('/bookings', wrap(async (req, res) => {
    const student = await requireStudent(req, repos);
    const now = deps.clock.now();
    const list = await repos.bookings.listByStudent(student.id, { since: listSince(req, now) });
    // 一覧で変更要求も返す(以前は画面が予約ごとに GET /bookings/:id を呼んでいた)
    const [hostList, requests] = await Promise.all([
      Promise.all([...new Set(list.map((b) => b.hostId))].map((id) => repos.hosts.findById(id))),
      repos.changeRequests.listByBookings(list.map((b) => b.id)),
    ]);
    const hosts = new Map(hostList.flatMap((h) => (h ? [[h.id, h] as const] : [])));
    res.json(
      list.map((b) => {
        const host = hosts.get(b.hostId) ?? null;
        return { ...decorate(b, now, host), ...feeInfo(b, host), changeRequests: requests.filter((r) => r.bookingId === b.id) };
      }),
    );
  }));

  r.get('/bookings/:id', wrap(async (req, res) => {
    const student = await requireStudent(req, repos);
    const booking = await deps.bookings.getBookingForStudent(param(req, 'id'), student);
    const [requests, host] = await Promise.all([repos.changeRequests.listByBookings([booking.id]), repos.hosts.findById(booking.hostId)]);
    res.json({
      ...decorate(booking, deps.clock.now(), host),
      ...feeInfo(booking, host),
      changeRequests: requests,
    });
  }));

  // 未払いのキャンセルフィーをオンラインで支払う(講師の Stripe アカウントへ直接)
  r.post('/bookings/:id/fee-checkout', wrap(async (req, res) => {
    const student = await requireStudent(req, repos);
    const body = successCancelSchema.parse(req.body);
    res.json({ url: await deps.fees.checkoutUrl(param(req, 'id'), student, body) });
  }));

  /**
   * キャンセル・変更。
   * 応答 200: 即時反映 { type: 'applied', booking }
   * 応答 202: 承認待ち   { type: 'pending_approval', booking, request }
   */
  r.post('/bookings/:id/change', wrap(async (req, res) => {
    const student = await requireStudent(req, repos);
    const body = changeSchema.parse(req.body);
    const outcome = await deps.bookings.requestChange({
      bookingId: param(req, 'id'),
      student,
      kind: body.kind,
      message: body.message,
      option: body.option,
      proposedStartAts: body.proposedStartAts ?? (body.proposedStartAt ? [body.proposedStartAt] : undefined),
      feeMethod: body.feeMethod,
    });
    res.status(outcome.type === 'applied' ? 200 : 202).json(outcome);
  }));

  return r;
}
