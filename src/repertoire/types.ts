/** 登録曲の状態。DBの check 制約(0002_repertoire.sql)と一致させること */
export type EntryStatus = 'practicing' | 'finished' | 'on_hold';

export const STATUS_OPTIONS: readonly EntryStatus[] = ['practicing', 'finished', 'on_hold'];

export const STATUS_LABELS: Record<EntryStatus, string> = {
  practicing: '練習中',
  finished: '仕上がり',
  on_hold: '保留',
};

export type Role = 'student' | 'teacher';

export interface Profile {
  id: string;
  role: Role;
  displayName: string;
}

export interface RepertoireEntry {
  id: string;
  userId: string;
  composer: string;
  title: string;
  status: EntryStatus;
  memo: string;
  /** YYYY-MM-DD。未入力は null */
  lessonDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 講師画面用: 生徒の表示名を結合した登録曲 */
export interface RepertoireEntryWithStudent extends RepertoireEntry {
  studentName: string;
}

/** 追加・編集フォームの入力値(すべて文字列。検証は logic.ts の validateEntryForm) */
export interface EntryFormValues {
  composer: string;
  title: string;
  status: EntryStatus;
  memo: string;
  lessonDate: string;
}
