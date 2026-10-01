/**
 * 実 PostgreSQL + PostgREST でのテスト環境(npm run test:db)。
 *
 * 1. 使い捨てのデータベースを作り、Supabase 相当のロールとマイグレーション 0001〜 を適用
 * 2. PostgREST を起動し、Supabase と同じ /rest/v1 の経路でつなぐ小さなプロキシを立てる
 * 3. service_role の JWT を発行し、テストへ URL と鍵を渡す(inject)
 *
 * 必要なもの: PostgreSQL(TEST_DATABASE_ADMIN_URL、既定 postgres://postgres:postgres@127.0.0.1:5432/postgres)
 *           PostgREST(POSTGREST_BIN。未指定なら Linux x64 版を node_modules/.cache にダウンロード)
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { SignJWT } from 'jose';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

const ROOT = path.resolve(import.meta.dirname, '..');
const POSTGREST_VERSION = 'v12.2.3';
const JWT_SECRET = 'test-only-jwt-secret-at-least-32-characters-long';

declare module 'vitest' {
  export interface ProvidedContext {
    supabaseUrl: string;
    supabaseServiceKey: string;
    databaseUrl: string;
  }
}

let postgrest: ChildProcess | null = null;
let proxy: http.Server | null = null;

export default async function setup(project: TestProject) {
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/postgres';
  const dbName = `lb_test_${process.pid}_${Date.now()}`;

  // 1. データベース作成・ロール・マイグレーション
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(readFileSync(path.join(ROOT, 'test-db/supabase-roles.sql'), 'utf8'));
  await admin.query(`create database ${dbName}`);
  await admin.end();

  const dbUrl = withDatabase(adminUrl, dbName);
  const db = new pg.Client({ connectionString: dbUrl });
  await db.connect();
  const migrationsDir = path.join(ROOT, 'supabase/migrations');
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.query(readFileSync(path.join(migrationsDir, file), 'utf8'));
    } catch (e) {
      throw new Error(`マイグレーション ${file} の適用に失敗しました: ${(e as Error).message}`);
    }
  }
  await db.query(readFileSync(path.join(ROOT, 'test-db/grants.sql'), 'utf8'));
  await db.end();

  // 2. PostgREST + /rest/v1 プロキシ
  const bin = await ensurePostgrest();
  const restPort = await freePort();
  const u = new URL(adminUrl);
  postgrest = spawn(bin, [], {
    env: {
      ...process.env,
      PGRST_DB_URI: `postgres://authenticator:authenticator@${u.hostname}:${u.port || 5432}/${dbName}`,
      PGRST_DB_SCHEMAS: 'public',
      PGRST_DB_ANON_ROLE: 'anon',
      PGRST_JWT_SECRET: JWT_SECRET,
      PGRST_SERVER_PORT: String(restPort),
      PGRST_SERVER_HOST: '127.0.0.1',
      PGRST_LOG_LEVEL: 'error',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  await waitFor(`http://127.0.0.1:${restPort}/`, 20_000);

  proxy = http.createServer((req, res) => {
    const target = (req.url ?? '/').replace(/^\/rest\/v1/, '') || '/';
    const upstream = http.request(
      { host: '127.0.0.1', port: restPort, path: target, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${restPort}` } },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('error', (e) => {
      res.writeHead(502);
      res.end(String(e));
    });
    req.pipe(upstream);
  });
  await new Promise<void>((resolve) => proxy!.listen(0, '127.0.0.1', resolve));
  const supabaseUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;

  // 3. service_role の鍵
  const serviceKey = await new SignJWT({ role: 'service_role' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(JWT_SECRET));

  project.provide('supabaseUrl', supabaseUrl);
  project.provide('supabaseServiceKey', serviceKey);
  project.provide('databaseUrl', dbUrl);

  return async () => {
    postgrest?.kill();
    await new Promise<void>((resolve) => (proxy ? proxy.close(() => resolve()) : resolve()));
    const a = new pg.Client({ connectionString: adminUrl });
    await a.connect();
    await a.query(`drop database if exists ${dbName} with (force)`);
    await a.end();
  };
}

function withDatabase(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

async function ensurePostgrest(): Promise<string> {
  if (process.env.POSTGREST_BIN) return process.env.POSTGREST_BIN;
  const dir = path.join(ROOT, 'node_modules/.cache/postgrest', POSTGREST_VERSION);
  const bin = path.join(dir, 'postgrest');
  if (existsSync(bin)) return bin;
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('PostgREST のバイナリを POSTGREST_BIN で指定してください(自動取得は Linux x64 のみ)');
  }
  mkdirSync(dir, { recursive: true });
  const url = `https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-linux-static-x64.tar.xz`;
  await run('sh', ['-c', `curl -fsSL "${url}" | tar -xJ -C "${dir}"`]);
  return bin;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} が終了コード ${code} で失敗しました`))));
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

async function waitFor(url: string, timeoutMs: number): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      /* まだ起動していない */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`PostgREST が起動しませんでした: ${url}`);
}
