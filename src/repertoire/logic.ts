import {
  STATUS_OPTIONS,
  type EntryFormValues,
  type EntryStatus,
  type RepertoireEntry,
  type RepertoireEntryWithStudent,
} from './types';

export const COMPOSER_MAX_LENGTH = 100;
export const TITLE_MAX_LENGTH = 200;
export const MEMO_MAX_LENGTH = 2000;

export function emptyFormValues(): EntryFormValues {
  return { composer: '', title: '', status: 'practicing', memo: '', lessonDate: '' };
}

export function formValuesFromEntry(entry: RepertoireEntry): EntryFormValues {
  return {
    composer: entry.composer,
    title: entry.title,
    status: entry.status,
    memo: entry.memo,
    lessonDate: entry.lessonDate ?? '',
  };
}

export type FormErrors = Partial<Record<keyof EntryFormValues, string>>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** 前後の空白を除いた上で検証する。エラーがなければ空オブジェクトを返す */
export function validateEntryForm(values: EntryFormValues): FormErrors {
  const errors: FormErrors = {};
  const composer = values.composer.trim();
  const title = values.title.trim();

  if (!composer) errors.composer = '作曲家を入力してください';
  else if (composer.length > COMPOSER_MAX_LENGTH)
    errors.composer = `作曲家は${COMPOSER_MAX_LENGTH}文字以内で入力してください`;

  if (!title) errors.title = '作品名を入力してください';
  else if (title.length > TITLE_MAX_LENGTH)
    errors.title = `作品名は${TITLE_MAX_LENGTH}文字以内で入力してください`;

  if (!STATUS_OPTIONS.includes(values.status)) errors.status = 'ステータスが不正です';

  if (values.memo.length > MEMO_MAX_LENGTH)
    errors.memo = `メモは${MEMO_MAX_LENGTH}文字以内で入力してください`;

  if (values.lessonDate && !isValidDate(values.lessonDate))
    errors.lessonDate = 'レッスン日は YYYY-MM-DD の形式で入力してください';

  return errors;
}

/** DBへ送る形に正規化する(空白除去、空のレッスン日は null) */
export function normalizeFormValues(values: EntryFormValues): {
  composer: string;
  title: string;
  status: EntryStatus;
  memo: string;
  lessonDate: string | null;
} {
  return {
    composer: values.composer.trim(),
    title: values.title.trim(),
    status: values.status,
    memo: values.memo.trim(),
    lessonDate: values.lessonDate || null,
  };
}

const collator = new Intl.Collator('ja');

/** 作曲家→作品名の順で五十音/アルファベット順に並べる(元の配列は変更しない) */
export function sortByComposerAndTitle<T extends RepertoireEntry>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (a, b) => collator.compare(a.composer, b.composer) || collator.compare(a.title, b.title),
  );
}

/** 更新日時の新しい順に並べる(元の配列は変更しない) */
export function sortByUpdatedDesc<T extends RepertoireEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export interface EntryFilter {
  /** 作曲家・作品名・生徒名に対する部分一致(大文字小文字を区別しない)。空なら絞り込まない */
  query: string;
  /** 'all' なら絞り込まない */
  status: EntryStatus | 'all';
}

export function filterEntries<T extends RepertoireEntry & { studentName?: string }>(
  entries: readonly T[],
  filter: EntryFilter,
): T[] {
  const q = filter.query.trim().toLocaleLowerCase();
  return entries.filter((entry) => {
    if (filter.status !== 'all' && entry.status !== filter.status) return false;
    if (!q) return true;
    const haystack = [entry.composer, entry.title, entry.studentName ?? '']
      .join('\n')
      .toLocaleLowerCase();
    return haystack.includes(q);
  });
}

export interface StudentGroup {
  userId: string;
  studentName: string;
  entries: RepertoireEntryWithStudent[];
}

/**
 * 講師画面用: 生徒ごとにまとめ、生徒名順(同名は userId 順)に並べる。
 * 各生徒内は作曲家→作品名順。
 */
export function groupByStudent(entries: readonly RepertoireEntryWithStudent[]): StudentGroup[] {
  const map = new Map<string, StudentGroup>();
  for (const entry of entries) {
    let group = map.get(entry.userId);
    if (!group) {
      group = { userId: entry.userId, studentName: entry.studentName, entries: [] };
      map.set(entry.userId, group);
    }
    group.entries.push(entry);
  }
  return [...map.values()]
    .map((g) => ({ ...g, entries: sortByComposerAndTitle(g.entries) }))
    .sort((a, b) => collator.compare(a.studentName, b.studentName) || a.userId.localeCompare(b.userId));
}

/** 表示名が未設定の場合の代替表示 */
export function displayNameOrFallback(displayName: string, fallback = '(名前未設定)'): string {
  const trimmed = displayName.trim();
  return trimmed || fallback;
}

/** YYYY-MM-DD を「2026年10月1日」形式にする。不正な値はそのまま返す */
export function formatLessonDate(lessonDate: string | null): string {
  if (!lessonDate) return '';
  if (!isValidDate(lessonDate)) return lessonDate;
  const [y, m, d] = lessonDate.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}
