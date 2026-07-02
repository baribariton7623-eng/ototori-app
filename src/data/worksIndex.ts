import type { WorksIndex } from '../types/music';

let cached: Promise<WorksIndex> | null = null;

/**
 * public/data/works/index.json (作品・楽章一覧の軽量メタ情報)を取得する。
 * 成功結果のみモジュール内でキャッシュする。取得に失敗した場合はキャッシュを
 * 残さず、次回呼び出し時に再度fetchする(一時的な通信エラーで恒久的に
 * 読み込み不能になるのを防ぐ)。
 */
export function loadWorksIndex(): Promise<WorksIndex> {
  if (!cached) {
    cached = fetch('/data/works/index.json')
      .then((res) => {
        if (!res.ok) throw new Error(`作品一覧の取得に失敗しました(HTTP ${res.status})`);
        return res.json() as Promise<WorksIndex>;
      })
      .catch((error: unknown) => {
        cached = null;
        throw error;
      });
  }
  return cached;
}
