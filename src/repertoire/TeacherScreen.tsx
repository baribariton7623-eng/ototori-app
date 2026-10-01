import { useEffect, useMemo, useState } from 'react';
import { createEntry, deleteEntry, listAllEntries, listStudents, updateEntry, type EntryInput } from './api';
import EntryCard, { EntryActions } from './EntryCard';
import EntryForm from './EntryForm';
import {
  buildStudentGroups,
  displayNameOrFallback,
  emptyFormValues,
  formValuesFromEntry,
  isFilterActive,
  type EntryFilter,
} from './logic';
import {
  STATUS_LABELS,
  STATUS_OPTIONS,
  type Profile,
  type RepertoireEntryWithStudent,
  type StudentSummary,
} from './types';

interface TeacherScreenProps {
  profile: Profile;
}

type Mode =
  | { kind: 'list' }
  | { kind: 'create'; student: StudentSummary }
  | { kind: 'edit'; entry: RepertoireEntryWithStudent };

export default function TeacherScreen({ profile }: TeacherScreenProps) {
  const [entries, setEntries] = useState<RepertoireEntryWithStudent[]>([]);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState<EntryFilter>({ query: '', status: 'all' });
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([listAllEntries(), listStudents()]).then(([entriesResult, studentsResult]) => {
      if (cancelled) return;
      if (entriesResult.ok) setEntries(entriesResult.data);
      if (studentsResult.ok) setStudents(studentsResult.data);
      const firstError = !entriesResult.ok
        ? entriesResult.error
        : !studentsResult.ok
          ? studentsResult.error
          : null;
      setError(firstError);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const groups = useMemo(() => buildStudentGroups(entries, students, filter), [entries, students, filter]);
  const entryCount = groups.reduce((sum, g) => sum + g.entries.length, 0);

  const handleCreate = async (student: StudentSummary, input: EntryInput): Promise<string | null> => {
    const result = await createEntry(student.id, input);
    if (!result.ok) return result.error;
    setEntries((prev) => [{ ...result.data, studentName: student.displayName }, ...prev]);
    setMode({ kind: 'list' });
    return null;
  };

  const handleUpdate = async (entry: RepertoireEntryWithStudent, input: EntryInput): Promise<string | null> => {
    const result = await updateEntry(entry.id, input);
    if (!result.ok) return result.error;
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...result.data, studentName: entry.studentName } : e)),
    );
    setMode({ kind: 'list' });
    return null;
  };

  const handleDelete = async (entry: RepertoireEntryWithStudent) => {
    const who = displayNameOrFallback(entry.studentName);
    if (!window.confirm(`${who} さんの「${entry.composer} / ${entry.title}」を削除しますか?`)) return;
    setActionError(null);
    const result = await deleteEntry(entry.id);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
  };

  if (mode.kind === 'create') {
    const { student } = mode;
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">
          {displayNameOrFallback(student.displayName)} さんの曲を追加
        </h2>
        <EntryForm
          initialValues={emptyFormValues()}
          submitLabel="追加する"
          onSubmit={(input) => handleCreate(student, input)}
          onCancel={() => setMode({ kind: 'list' })}
        />
      </section>
    );
  }

  if (mode.kind === 'edit') {
    const { entry } = mode;
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">
          {displayNameOrFallback(entry.studentName)} さんの曲を編集
        </h2>
        <EntryForm
          initialValues={formValuesFromEntry(entry)}
          submitLabel="保存する"
          onSubmit={(input) => handleUpdate(entry, input)}
          onCancel={() => setMode({ kind: 'list' })}
        />
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <p className="text-sm text-ink-soft">
        {displayNameOrFallback(profile.displayName)} さん(講師)としてログイン中。全生徒の登録曲を閲覧・追加・編集・削除できます。
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
          {loading ? '読み込み中...' : `${groups.length}名 / ${entryCount}曲`}
        </p>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          disabled={loading}
          className="h-9 rounded-full border border-hairline px-3 text-sm font-medium text-ink-soft transition hover:bg-paper-soft disabled:opacity-40"
        >
          更新
        </button>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {actionError && <p className="text-sm text-red-700">{actionError}</p>}

      {!loading && !error && groups.length === 0 && (
        <div className="rounded-2xl border border-dashed border-hairline p-8 text-center text-base text-ink-soft">
          {isFilterActive(filter) ? '条件に一致する登録がありません。' : 'まだ生徒が登録されていません。'}
        </div>
      )}

      {groups.map((group) => (
        <div key={group.userId} className="space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-hairline pb-1">
            <h2 className="flex min-w-0 items-baseline gap-2 text-lg font-bold tracking-tight">
              <span className="truncate">{displayNameOrFallback(group.studentName)}</span>
              <span className="shrink-0 text-sm font-normal text-ink-faint">{group.entries.length}曲</span>
            </h2>
            <button
              onClick={() =>
                setMode({ kind: 'create', student: { id: group.userId, displayName: group.studentName } })
              }
              className="h-9 shrink-0 rounded-full px-3 text-sm font-medium text-accent transition hover:bg-accent-soft"
            >
              + 追加
            </button>
          </div>
          {group.entries.length === 0 ? (
            <p className="text-sm text-ink-faint">登録された曲はまだありません。</p>
          ) : (
            <ul className="space-y-3">
              {group.entries.map((entry) => (
                <li key={entry.id}>
                  <EntryCard
                    entry={entry}
                    actions={
                      <EntryActions
                        onEdit={() => setMode({ kind: 'edit', entry })}
                        onDelete={() => handleDelete(entry)}
                      />
                    }
                  />
                </li>
              ))}
            </ul>
          )}
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
