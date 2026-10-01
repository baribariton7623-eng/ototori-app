import type { NextFunction, Request, Response } from 'express';
import { jwtVerify } from 'jose';
import { DomainError } from '../domain/errors.js';
import type { Host, Student } from '../shared/types.js';
import type { Repositories } from '../repo/Repository.js';

/** 認証済みユーザー。主催者として登録済みなら host が入る */
export interface Principal {
  email: string;
  name: string;
  /** ログイン基盤上のユーザー ID(Supabase JWT の sub)。dev モードでは null */
  subject: string | null;
  host: Host | null;
}

export type AuthMode = { mode: 'dev' } | { mode: 'supabase'; jwtSecret: string };

declare module 'express-serve-static-core' {
  interface Request {
    principal?: Principal;
  }
}

/**
 * 認証ミドルウェア。
 * - dev: `x-dev-user-email`(必須)と `x-dev-user-name`(任意, URLエンコード可)ヘッダをそのまま信用する。ローカル専用。
 * - supabase: `Authorization: Bearer <JWT>` を Supabase の JWT secret(HS256)で検証し email を取り出す。
 */
export function authMiddleware(repos: Repositories, auth: AuthMode) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const identity = auth.mode === 'dev' ? devIdentity(req) : await supabaseIdentity(req, auth.jwtSecret);
      if (!identity) return next();
      const host = await repos.hosts.findByEmail(identity.email);
      req.principal = { email: identity.email, name: identity.name, subject: identity.subject, host };
      next();
    } catch (e) {
      next(e);
    }
  };
}

interface Identity {
  email: string;
  name: string;
  subject: string | null;
}

function devIdentity(req: Request): Identity | null {
  const email = header(req, 'x-dev-user-email');
  if (!email) return null;
  return { email: email.toLowerCase(), name: safeDecode(header(req, 'x-dev-user-name') ?? ''), subject: null };
}

/** ヘッダは Latin-1 しか載せられないため、日本語名は URL エンコードして渡す */
function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

async function supabaseIdentity(req: Request, secret: string): Promise<Identity | null> {
  const authz = header(req, 'authorization');
  if (!authz?.startsWith('Bearer ')) return null;
  const token = authz.slice('Bearer '.length).trim();
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] });
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
    if (!email) throw new DomainError('forbidden', 'トークンに email が含まれていません');
    const meta = (payload.user_metadata ?? {}) as Record<string, unknown>;
    const name = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : '';
    return { email, name, subject: typeof payload.sub === 'string' ? payload.sub : null };
  } catch (e) {
    if (e instanceof DomainError) throw e;
    throw new DomainError('forbidden', '認証トークンが無効です');
  }
}

function header(req: Request, name: string): string | undefined {
  const v = req.headers[name];
  if (Array.isArray(v)) return v[0];
  return v;
}

export function requirePrincipal(req: Request): Principal {
  if (!req.principal) throw new DomainError('forbidden', 'ログインが必要です');
  return req.principal;
}

export function requireHost(req: Request, hostId?: string): Host {
  const p = requirePrincipal(req);
  if (!p.host) throw new DomainError('forbidden', '主催者のみ操作できます');
  if (hostId && p.host.id !== hostId) throw new DomainError('forbidden', '他の主催者のリソースは操作できません');
  return p.host;
}

/** 生徒として振る舞う。未登録なら自動登録する */
export async function requireStudent(req: Request, repos: Repositories): Promise<Student> {
  const p = requirePrincipal(req);
  const existing = await repos.students.findByEmail(p.email);
  if (existing) return existing;
  return repos.students.create({ email: p.email, name: p.name });
}
