import type { MovementData } from '../types/music';

/** public/data/works/<workId>/<movementId>.json (楽章の全パート音符データ)を取得する */
export function loadMovement(workId: string, movementId: string): Promise<MovementData> {
  return fetch(`/data/works/${workId}/${movementId}.json`).then((res) => {
    if (!res.ok) throw new Error(`楽章データの取得に失敗しました(HTTP ${res.status})`);
    return res.json() as Promise<MovementData>;
  });
}
