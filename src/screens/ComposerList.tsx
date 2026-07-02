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

  if (error) return <p className="p-6 text-base text-red-700">{error}</p>;
  if (!index) return <p className="p-6 text-base text-ink-soft">読み込み中...</p>;

  const groups = groupByComposer(index.works);
  const filtered = filterComposerGroups(groups, query);

  return (
    <div className="px-4 pb-8 pt-2 sm:px-6">
      <div className="sticky top-16 z-10 -mx-4 bg-paper/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="作曲家名・曲名で検索"
          className="h-12 w-full rounded-xl border border-hairline bg-card px-4 text-base text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent"
          aria-label="曲を検索"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-1 py-8 text-base text-ink-soft">該当する作曲家・曲が見つかりません</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {filtered.map((group) => (
            <li key={group.composer}>
              <button
                onClick={() => onSelectComposer(group.composer)}
                className="flex w-full items-center justify-between rounded-2xl border border-hairline bg-card px-5 py-4 text-left shadow-sm transition hover:border-accent/40 hover:shadow-md active:scale-[0.99]"
              >
                <div>
                  <div className="text-lg font-semibold text-ink">{group.composer}</div>
                  <div className="mt-0.5 text-sm text-ink-soft">
                    {group.sortKey !== null ? `${group.sortKey}年生まれ ・ ` : ''}
                    {group.works.length}作品
                  </div>
                </div>
                <span className="text-xl text-ink-faint" aria-hidden>
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
