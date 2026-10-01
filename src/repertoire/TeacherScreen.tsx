import { useEffect, useMemo, useState } from 'react';
import { listAllEntries } from './api';
import EntryCard from './EntryCard';
import { displayNameOrFallback, filterEntries, groupByStudent, type EntryFilter } from './logic';
import { STATUS_LABELS, STATUS_OPTIONS, type Profile, type RepertoireEntryWithStudent } from './types';

interface TeacherScreenProps {
  profile: Profile;
}

export default function TeacherScreen({ profile }: TeacherScreenProps) {
  const [entries, setEntries] = useState<RepertoireEntryWithStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<EntryFilter>({ query: '', status: 'all' });

  const load = async () => {
    setLoading(true);
    setError(null);
    const result = await listAllEntries();
    if (result.ok) setEntries(result.data);
    else setError(result.error);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const groups = useMemo(() => groupByStudent(filterEntries(entries, filter)), [entries, filter]);
  const filteredCount = groups.reduce((sum, g) => sum + g.entries.length, 0);

  return (
    <section className="space-y-5">
      <p className="text-sm text-ink-soft">
        {displayNameOrFallback(profile.displayName)} さん(講師)としてログイン中。全生徒の登録曲を閲覧できます。
      </p>

      <div className="space-y-3 rounded-2xl border border-hairline bg-card p-4">
        <input
          type="search"
          value={filter.query}
          onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
          placeholder="生徒名・作曲家・作品名で検索"
          className="h-12 w-full rounded-xl border border-hairline bg-paper px-4 text-base text-ink outline-none placeholder:text-ink-faint focus:border-accent"
        />
        <div className="flex flex-wrap gap-2">
          <FilterChip active={filter.status === 'all'} onClick={() => setFilter((f) => ({ ...f, status: 'all' }))}>
            すべて
          </FilterChip>
          {STATUS_OPTIONS.map((s) => (
            <FilterChip key={s} active={filter.status === s} onClick={() => setFilter((f) => ({ ...f, status: s }))}>
              {STATUS_LABELS[s]}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-soft">
          {loading ? '読み込み中...' : `${groups.length}名 / ${filteredCount}曲`}
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="h-9 rounded-full border border-hairline px-3 text-sm font-medium text-ink-soft transition hover:bg-paper-soft disabled:opacity-40"
        >
          更新
        </button>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {!loading && !error && groups.length === 0 && (
        <div className="rounded-2xl border border-dashed border-hairline p-8 text-center text-base text-ink-soft">
          {entries.length === 0 ? 'まだ生徒の登録がありません。' : '条件に一致する登録がありません。'}
        </div>
      )}

      {groups.map((group) => (
        <div key={group.userId} className="space-y-3">
          <h2 className="flex items-baseline gap-2 border-b border-hairline pb-1 text-lg font-bold tracking-tight">
            {displayNameOrFallback(group.studentName)}
            <span className="text-sm font-normal text-ink-faint">{group.entries.length}曲</span>
          </h2>
          <ul className="space-y-3">
            {group.entries.map((entry) => (
              <li key={entry.id}>
                <EntryCard entry={entry} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 items-center rounded-full border px-4 text-sm font-medium transition ${
        active ? 'border-accent bg-accent text-paper' : 'border-hairline bg-paper text-ink-soft hover:bg-paper-soft'
      }`}
    >
      {children}
    </button>
  );
}
