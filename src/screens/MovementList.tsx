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

  if (error) return <p className="p-4 text-red-400">{error}</p>;
  if (!index) return <p className="p-4 text-gray-400">読み込み中...</p>;

  const work = index.works.find((w) => w.id === workId);
  if (!work) return <p className="p-4 text-red-400">作品が見つかりません</p>;

  return (
    <ul className="divide-y divide-gray-800">
      {work.movements.map((movement) => (
        <li key={movement.id}>
          <button
            onClick={() => onSelectMovement(movement.id)}
            className="w-full px-4 py-4 text-left hover:bg-gray-800"
          >
            <div className="font-medium">{movement.title}</div>
            <div className="text-sm text-gray-400">
              {movement.timeSignature.beats}/{movement.timeSignature.beatType} ・ ♩=
              {movement.baseBpm} ・ {movement.measureCount}小節 ・ {movement.partLabels.length}パート
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
