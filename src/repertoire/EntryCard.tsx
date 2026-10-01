import { formatLessonDate } from './logic';
import { STATUS_LABELS, type EntryStatus, type RepertoireEntry } from './types';

const STATUS_CLASS: Record<EntryStatus, string> = {
  practicing: 'bg-accent-soft text-accent-dark',
  finished: 'bg-emerald-50 text-emerald-800',
  on_hold: 'bg-paper-soft text-ink-soft',
};

export function StatusBadge({ status }: { status: EntryStatus }) {
  return (
    <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

/** カード右下の編集・削除ボタン(生徒画面・講師画面で共用) */
export function EntryActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <>
      <button
        onClick={onEdit}
        className="h-10 rounded-full border border-hairline px-4 text-sm font-medium text-ink-soft transition hover:bg-paper-soft active:scale-95"
      >
        編集
      </button>
      <button
        onClick={onDelete}
        className="h-10 rounded-full px-4 text-sm font-medium text-red-700 transition hover:bg-red-50 active:scale-95"
      >
        削除
      </button>
    </>
  );
}

interface EntryCardProps {
  entry: RepertoireEntry;
  /** カード右下に表示する操作ボタン(通常は EntryActions) */
  actions?: React.ReactNode;
}

export default function EntryCard({ entry, actions }: EntryCardProps) {
  const lessonDate = formatLessonDate(entry.lessonDate);
  return (
    <article className="rounded-2xl border border-hairline bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-soft">{entry.composer}</p>
          <h3 className="text-lg font-semibold leading-snug tracking-tight text-ink">{entry.title}</h3>
        </div>
        <StatusBadge status={entry.status} />
      </div>
      {(lessonDate || entry.memo) && (
        <div className="mt-2 space-y-1 text-sm text-ink-soft">
          {lessonDate && <p>レッスン日: {lessonDate}</p>}
          {entry.memo && <p className="whitespace-pre-wrap break-words">{entry.memo}</p>}
        </div>
      )}
      {actions && <div className="mt-3 flex justify-end gap-2">{actions}</div>}
    </article>
  );
}
