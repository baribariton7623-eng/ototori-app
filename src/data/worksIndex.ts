import type { WorksIndex } from '../types/music';

let cached: Promise<WorksIndex> | null = null;

/** public/data/works/index.json (作品・楽章一覧の軽量メタ情報)を取得する。結果はモジュール内でキャッシュする */
export function loadWorksIndex(): Promise<WorksIndex> {
  cached ??= fetch('/data/works/index.json').then((res) => {
    if (!res.ok) throw new Error(`作品一覧の取得に失敗しました(HTTP ${res.status})`);
    return res.json() as Promise<WorksIndex>;
  });
  return cached;
}
