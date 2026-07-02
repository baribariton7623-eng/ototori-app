import { useEffect, useState } from 'react';
import { loadWorksIndex } from '../data/worksIndex';
import type { WorksIndex } from '../types/music';

interface MovementListProps {
  workId: string;
  onSelectMovement: (movementId: string) => void;
}

export default function MovementList({ workId, onSelectMovement }: MovementListProps) {
  const [index, setIndex] = useState<WorksIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWorksIndex()
      .then(setIndex)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <p className="p-6 text-base text-red-700">{error}</p>;
  if (!index) return <p className="p-6 text-base text-ink-soft">読み込み中...</p>;

  const work = index.works.find((w) => w.id === workId);
  if (!work) return <p className="p-6 text-base text-red-700">作品が見つかりません</p>;

  return (
    <div className="px-4 py-4 sm:px-6">
      <div className="mb-3 px-1">
        <div className="text-sm text-ink-soft">{work.composer}</div>
        <div className="text-xl font-semibold text-ink">{work.title}</div>
      </div>
      <ul className="space-y-2">
        {work.movements.map((movement) => (
          <li key={movement.id}>
            <button
              onClick={() => onSelectMovement(movement.id)}
              className="flex w-full items-center justify-between rounded-2xl border border-hairline bg-card px-5 py-4 text-left shadow-sm transition hover:border-accent/40 hover:shadow-md active:scale-[0.99]"
            >
              <div>
                <div className="text-lg font-semibold text-ink">{movement.title}</div>
                <div className="mt-0.5 text-sm text-ink-soft">
                  {movement.timeSignature.beats}/{movement.timeSignature.beatType} ・ ♩=
                  {movement.baseBpm} ・ {movement.measureCount}小節 ・ {movement.partLabels.length}
                  パート
                </div>
              </div>
              <span className="text-xl text-ink-faint" aria-hidden>
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
