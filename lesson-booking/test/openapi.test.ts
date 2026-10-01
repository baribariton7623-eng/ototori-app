import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/http/app.js';
import { appDeps, setupWorld } from './helpers.js';

/**
 * openapi.yaml は手で書いている。ルートの追加・削除で食い違わないよう、実際に登録されたルートと突き合わせる
 * (開発用の /billing/fake/* は載せない)
 */
interface Layer {
  route?: { path: string | string[]; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

function registeredRoutes(stack: Layer[]): string[] {
  const out: string[] = [];
  for (const layer of stack) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const p of paths) {
        for (const m of Object.keys(layer.route.methods)) out.push(`${m.toUpperCase()} ${p.replace(/:(\w+)/g, '{$1}')}`);
      }
    } else if (layer.handle?.stack) {
      out.push(...registeredRoutes(layer.handle.stack));
    }
  }
  return out;
}

function documentedRoutes(yaml: string): string[] {
  const out: string[] = [];
  let current: string | null = null;
  for (const line of yaml.split('\n')) {
    const path = /^ {2}(\/\S*):\s*$/.exec(line);
    if (path) {
      current = path[1] ?? null;
      continue;
    }
    if (/^\S/.test(line)) current = null;
    const method = /^ {4}(get|post|put|patch|delete):/.exec(line);
    if (current && method) out.push(`${method[1]?.toUpperCase()} ${current}`);
  }
  return out;
}

describe('openapi.yaml', () => {
  it('実装されたエンドポイントと過不足がない', async () => {
    const w = await setupWorld();
    const app = createApp(appDeps(w));
    const registered = registeredRoutes((app as unknown as { router: { stack: Layer[] } }).router.stack)
      .filter((r) => !r.includes(' /billing/fake/'))
      .sort();
    const documented = documentedRoutes(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8')).sort();
    expect(registered.length).toBeGreaterThan(40);
    expect({ missingInOpenapi: registered.filter((r) => !documented.includes(r)), notImplemented: documented.filter((r) => !registered.includes(r)) }).toEqual({
      missingInOpenapi: [],
      notImplemented: [],
    });
  });
});
