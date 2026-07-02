import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('loadWorksIndex', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('初回取得に失敗しても、次回呼び出しで再試行できる(失敗をキャッシュしない)', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(() => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve({ ok: false, status: 500 } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ works: [] }),
      } as unknown as Response);
    }) as unknown as typeof fetch;

    const { loadWorksIndex } = await import('../worksIndex');

    await expect(loadWorksIndex()).rejects.toThrow(/取得に失敗/);
    expect(callCount).toBe(1);

    const result = await loadWorksIndex();
    expect(result).toEqual({ works: [] });
    expect(callCount).toBe(2);
  });

  it('成功した結果はキャッシュされ、再度fetchしない', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(() => {
      callCount += 1;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ works: [] }),
      } as unknown as Response);
    }) as unknown as typeof fetch;

    const { loadWorksIndex } = await import('../worksIndex');

    await loadWorksIndex();
    await loadWorksIndex();
    expect(callCount).toBe(1);
  });
});
