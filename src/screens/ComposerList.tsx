import { useEffect, useState } from 'react';
import { loadWorksIndex } from '../data/worksIndex';
import { filterComposerGroups, groupByComposer } from '../lib/composerSearch';
import type { WorksIndex } from '../types/music';

interface ComposerListProps {
  onSelectComposer: (composer: string) => void;
}

export default function ComposerList({ onSelectComposer }: ComposerListProps) {
  const [index, setIndex] = useState<WorksIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    loadWorksIndex()
      .then(setIndex)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <p className="p-4 text-red-400">{error}</p>;
  if (!index) return <p className="p-4 text-gray-400">読み込み中...</p>;

  const groups = groupByComposer(index.works);
  const filtered = filterComposerGroups(groups, query);

  return (
    <div>
      <div className="p-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="作曲家名・曲名で検索"
          className="w-full rounded bg-gray-800 px-3 py-2 text-sm"
          aria-label="曲を検索"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="px-4 text-gray-400">該当する作曲家・曲が見つかりません</p>
      ) : (
        <ul className="divide-y divide-gray-800">
          {filtered.map((group) => (
            <li key={group.composer}>
              <button
                onClick={() => onSelectComposer(group.composer)}
                className="w-full px-4 py-4 text-left hover:bg-gray-800"
              >
                <div className="font-medium">{group.composer}</div>
                <div className="text-sm text-gray-400">
                  {group.sortKey !== null ? `${group.sortKey}年生まれ ・ ` : ''}
                  {group.works.length}作品
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
