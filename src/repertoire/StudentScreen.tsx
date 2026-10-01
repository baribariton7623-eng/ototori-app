import { useEffect, useState } from 'react';
import { createEntry, deleteEntry, listMyEntries, updateDisplayName, updateEntry, type EntryInput } from './api';
import EntryCard from './EntryCard';
import EntryForm from './EntryForm';
import { displayNameOrFallback, emptyFormValues, formValuesFromEntry, sortByUpdatedDesc } from './logic';
import type { Profile, RepertoireEntry } from './types';

interface StudentScreenProps {
  profile: Profile;
  onProfileChange: (profile: Profile) => void;
}

type Mode = { kind: 'list' } | { kind: 'create' } | { kind: 'edit'; entry: RepertoireEntry };

export default function StudentScreen({ profile, onProfileChange }: StudentScreenProps) {
  const [entries, setEntries] = useState<RepertoireEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMyEntries(profile.id).then((result) => {
      if (cancelled) return;
      if (result.ok) setEntries(result.data);
      else setLoadError(result.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [profile.id]);

  const handleCreate = async (input: EntryInput): Promise<string | null> => {
    const result = await createEntry(profile.id, input);
    if (!result.ok) return result.error;
    setEntries((prev) => sortByUpdatedDesc([result.data, ...prev]));
    setMode({ kind: 'list' });
    return null;
  };

  const handleUpdate = async (entryId: string, input: EntryInput): Promise<string | null> => {
    const result = await updateEntry(entryId, input);
    if (!result.ok) return result.error;
    setEntries((prev) => sortByUpdatedDesc(prev.map((e) => (e.id === entryId ? result.data : e))));
    setMode({ kind: 'list' });
    return null;
  };

  const handleDelete = async (entry: RepertoireEntry) => {
    if (!window.confirm(`「${entry.composer} / ${entry.title}」を削除しますか?`)) return;
    setActionError(null);
    const result = await deleteEntry(entry.id);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
  };

  if (mode.kind === 'create') {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">曲を追加</h2>
        <EntryForm
          initialValues={emptyFormValues()}
          submitLabel="追加する"
          onSubmit={handleCreate}
          onCancel={() => setMode({ kind: 'list' })}
        />
      </section>
    );
  }

  if (mode.kind === 'edit') {
    const { entry } = mode;
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">曲を編集</h2>
        <EntryForm
          initialValues={formValuesFromEntry(entry)}
          submitLabel="保存する"
          onSubmit={(input) => handleUpdate(entry.id, input)}
          onCancel={() => setMode({ kind: 'list' })}
        />
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <DisplayNameEditor profile={profile} onProfileChange={onProfileChange} />

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">
          マイレパートリー
          {!loading && <span className="ml-2 text-base font-normal text-ink-faint">{entries.length}曲</span>}
        </h2>
        <button
          onClick={() => setMode({ kind: 'create' })}
          className="flex h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-paper shadow-sm transition hover:bg-accent-dark active:scale-95"
        >
          + 追加
        </button>
      </div>

      {actionError && <p className="text-sm text-red-700">{actionError}</p>}
      {loadError && <p className="text-sm text-red-700">{loadError}</p>}

      {loading ? (
        <p className="text-base text-ink-soft">読み込み中...</p>
      ) : entries.length === 0 && !loadError ? (
        <div className="rounded-2xl border border-dashed border-hairline p-8 text-center text-base text-ink-soft">
          まだ登録がありません。「+ 追加」から作曲家と作品名を登録してください。
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id}>
              <EntryCard
                entry={entry}
                actions={
                  <>
                    <button
                      onClick={() => setMode({ kind: 'edit', entry })}
                      className="h-10 rounded-full border border-hairline px-4 text-sm font-medium text-ink-soft transition hover:bg-paper-soft active:scale-95"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => handleDelete(entry)}
                      className="h-10 rounded-full px-4 text-sm font-medium text-red-700 transition hover:bg-red-50 active:scale-95"
                    >
                      削除
                    </button>
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DisplayNameEditor({ profile, onProfileChange }: StudentScreenProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(profile.displayName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('表示名を入力してください');
      return;
    }
    if (trimmed.length > 50) {
      setError('表示名は50文字以内で入力してください');
      return;
    }
    setSaving(true);
    setError(null);
    const result = await updateDisplayName(profile.id, trimmed);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onProfileChange({ ...profile, displayName: trimmed });
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-hairline bg-card px-4 py-3">
        <p className="min-w-0 truncate text-base">
          <span className="text-sm text-ink-soft">表示名: </span>
          <span className="font-medium">{displayNameOrFallback(profile.displayName)}</span>
        </p>
        <button
          onClick={() => {
            setValue(profile.displayName);
            setEditing(true);
          }}
          className="h-9 shrink-0 rounded-full px-3 text-sm font-medium text-accent transition hover:bg-accent-soft"
        >
          変更
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-hairline bg-card p-4">
      <label className="block text-sm text-ink-soft">
        表示名(講師の一覧に表示されます)
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={50}
          className="mt-1 h-11 w-full rounded-xl border border-hairline bg-paper px-4 text-base text-ink outline-none focus:border-accent"
        />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setEditing(false)}
          disabled={saving}
          className="h-10 rounded-full px-4 text-sm font-medium text-ink-soft transition hover:bg-paper-soft"
        >
          キャンセル
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="h-10 rounded-full bg-accent px-4 text-sm font-semibold text-paper transition hover:bg-accent-dark disabled:opacity-40"
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}
