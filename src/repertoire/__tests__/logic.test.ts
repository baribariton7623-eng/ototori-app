import { describe, expect, it } from 'vitest';
import {
  buildStudentGroups,
  displayNameOrFallback,
  emptyFormValues,
  filterEntries,
  formatLessonDate,
  formValuesFromEntry,
  groupByStudent,
  isFilterActive,
  normalizeFormValues,
  sortByComposerAndTitle,
  sortByUpdatedDesc,
  validateEntryForm,
} from '../logic';
import type { RepertoireEntry, RepertoireEntryWithStudent } from '../types';

// テスト用の架空データ
function entry(partial: Partial<RepertoireEntryWithStudent> & { id: string }): RepertoireEntryWithStudent {
  return {
    userId: 'u1',
    composer: '作曲家',
    title: '作品',
    status: 'practicing',
    memo: '',
    lessonDate: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    studentName: '生徒',
    ...partial,
  };
}

describe('validateEntryForm', () => {
  it('作曲家・作品名が空ならエラー', () => {
    const errors = validateEntryForm(emptyFormValues());
    expect(errors.composer).toBeDefined();
    expect(errors.title).toBeDefined();
  });

  it('空白だけの入力は未入力扱い', () => {
    const errors = validateEntryForm({ ...emptyFormValues(), composer: '  ', title: '\t' });
    expect(errors.composer).toBeDefined();
    expect(errors.title).toBeDefined();
  });

  it('正しい入力ではエラーなし', () => {
    const errors = validateEntryForm({
      composer: 'シューベルト',
      title: '野ばら',
      status: 'finished',
      memo: '',
      lessonDate: '2026-10-01',
    });
    expect(errors).toEqual({});
  });

  it('文字数上限を超えるとエラー', () => {
    const errors = validateEntryForm({
      ...emptyFormValues(),
      composer: 'a'.repeat(101),
      title: 'b'.repeat(201),
      memo: 'c'.repeat(2001),
    });
    expect(errors.composer).toBeDefined();
    expect(errors.title).toBeDefined();
    expect(errors.memo).toBeDefined();
  });

  it('レッスン日は空か正しい日付のみ許可', () => {
    const base = { ...emptyFormValues(), composer: 'a', title: 'b' };
    expect(validateEntryForm({ ...base, lessonDate: '' })).toEqual({});
    expect(validateEntryForm({ ...base, lessonDate: '2026-02-30' }).lessonDate).toBeDefined();
    expect(validateEntryForm({ ...base, lessonDate: '2026/10/01' }).lessonDate).toBeDefined();
  });
});

describe('normalizeFormValues / formValuesFromEntry', () => {
  it('前後の空白を除き、空のレッスン日は null にする', () => {
    expect(
      normalizeFormValues({ composer: ' バッハ ', title: ' マタイ ', status: 'on_hold', memo: ' メモ ', lessonDate: '' }),
    ).toEqual({ composer: 'バッハ', title: 'マタイ', status: 'on_hold', memo: 'メモ', lessonDate: null });
  });

  it('登録済みデータからフォーム値を復元できる', () => {
    const values = formValuesFromEntry(entry({ id: 'e1', lessonDate: null, memo: 'x' }));
    expect(values).toEqual({ composer: '作曲家', title: '作品', status: 'practicing', memo: 'x', lessonDate: '' });
  });
});

describe('sort', () => {
  it('作曲家→作品名の順に並べ、元の配列は変更しない', () => {
    const list: RepertoireEntry[] = [
      entry({ id: '1', composer: 'ヘンデル', title: 'メサイア' }),
      entry({ id: '2', composer: 'バッハ', title: 'ロ短調ミサ' }),
      entry({ id: '3', composer: 'バッハ', title: 'マタイ受難曲' }),
    ];
    const sorted = sortByComposerAndTitle(list);
    expect(sorted.map((e) => e.id)).toEqual(['3', '2', '1']);
    expect(list.map((e) => e.id)).toEqual(['1', '2', '3']);
  });

  it('更新日時の新しい順に並べる', () => {
    const sorted = sortByUpdatedDesc([
      entry({ id: 'old', updatedAt: '2026-01-01T00:00:00Z' }),
      entry({ id: 'new', updatedAt: '2026-03-01T00:00:00Z' }),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(['new', 'old']);
  });
});

describe('filterEntries', () => {
  const list = [
    entry({ id: '1', composer: 'Schubert', title: '野ばら', status: 'practicing', studentName: '山田' }),
    entry({ id: '2', composer: 'バッハ', title: 'アリア', status: 'finished', studentName: '佐藤' }),
    entry({ id: '3', composer: 'ヘンデル', title: 'ラルゴ', status: 'on_hold', studentName: '山田' }),
  ];

  it('空の条件では全件返す', () => {
    expect(filterEntries(list, { query: '', status: 'all' })).toHaveLength(3);
  });

  it('ステータスで絞り込む', () => {
    expect(filterEntries(list, { query: '', status: 'finished' }).map((e) => e.id)).toEqual(['2']);
  });

  it('作曲家・作品名・生徒名に対して大文字小文字を無視した部分一致', () => {
    expect(filterEntries(list, { query: 'schu', status: 'all' }).map((e) => e.id)).toEqual(['1']);
    expect(filterEntries(list, { query: 'アリア', status: 'all' }).map((e) => e.id)).toEqual(['2']);
    expect(filterEntries(list, { query: '山田', status: 'all' }).map((e) => e.id)).toEqual(['1', '3']);
  });

  it('検索語とステータスの両方を満たすものだけ返す', () => {
    expect(filterEntries(list, { query: '山田', status: 'on_hold' }).map((e) => e.id)).toEqual(['3']);
  });
});

describe('groupByStudent', () => {
  it('生徒ごとにまとめ、生徒名順・各生徒内は作曲家→作品名順に並べる', () => {
    const groups = groupByStudent([
      entry({ id: '1', userId: 'b', studentName: '山田', composer: 'ヘンデル', title: 'ラルゴ' }),
      entry({ id: '2', userId: 'a', studentName: '佐藤', composer: 'バッハ', title: 'アリア' }),
      entry({ id: '3', userId: 'b', studentName: '山田', composer: 'バッハ', title: 'マタイ' }),
    ]);
    expect(groups.map((g) => g.studentName)).toEqual(['佐藤', '山田']);
    expect(groups[1].entries.map((e) => e.id)).toEqual(['3', '1']);
  });

  it('同名の生徒は userId で区別する', () => {
    const groups = groupByStudent([
      entry({ id: '1', userId: 'x', studentName: '同名' }),
      entry({ id: '2', userId: 'y', studentName: '同名' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.userId)).toEqual(['x', 'y']);
  });
});

describe('groupByStudent(生徒一覧あり)', () => {
  it('曲が0件の生徒も空のグループとして含める', () => {
    const groups = groupByStudent(
      [entry({ id: '1', userId: 'a', studentName: '佐藤' })],
      [
        { id: 'a', displayName: '佐藤' },
        { id: 'b', displayName: '山田' },
      ],
    );
    expect(groups.map((g) => [g.studentName, g.entries.length])).toEqual([
      ['佐藤', 1],
      ['山田', 0],
    ]);
  });

  it('生徒一覧にないユーザーの曲もグループとして残す', () => {
    const groups = groupByStudent([entry({ id: '1', userId: 'x', studentName: '講師' })], []);
    expect(groups.map((g) => g.userId)).toEqual(['x']);
  });
});

describe('buildStudentGroups', () => {
  const students = [
    { id: 'a', displayName: '佐藤' },
    { id: 'b', displayName: '山田' },
    { id: 'c', displayName: '鈴木' },
  ];
  const list = [
    entry({ id: '1', userId: 'a', studentName: '佐藤', composer: 'バッハ', status: 'finished' }),
    entry({ id: '2', userId: 'b', studentName: '山田', composer: 'ヘンデル', status: 'practicing' }),
  ];

  it('絞り込みなしでは曲0件の生徒も含めて全員を返す', () => {
    const groups = buildStudentGroups(list, students, { query: '', status: 'all' });
    expect(groups).toHaveLength(3);
  });

  it('絞り込みありでは一致する曲を持つ生徒だけを返す', () => {
    const groups = buildStudentGroups(list, students, { query: 'バッハ', status: 'all' });
    expect(groups.map((g) => g.userId)).toEqual(['a']);
  });

  it('生徒名で検索すると曲0件の生徒もヒットする', () => {
    const groups = buildStudentGroups(list, students, { query: '鈴木', status: 'all' });
    expect(groups.map((g) => [g.userId, g.entries.length])).toEqual([['c', 0]]);
  });

  it('ステータス指定時は曲0件の生徒を含めない', () => {
    const groups = buildStudentGroups(list, students, { query: '鈴木', status: 'practicing' });
    expect(groups).toEqual([]);
  });

  it('isFilterActive は空白だけの検索語を無視する', () => {
    expect(isFilterActive({ query: '  ', status: 'all' })).toBe(false);
    expect(isFilterActive({ query: '', status: 'on_hold' })).toBe(true);
  });
});

describe('表示ユーティリティ', () => {
  it('表示名が空なら代替表示', () => {
    expect(displayNameOrFallback('  ')).toBe('(名前未設定)');
    expect(displayNameOrFallback('山田')).toBe('山田');
  });

  it('レッスン日を和暦なしの日本語表記にする', () => {
    expect(formatLessonDate('2026-10-01')).toBe('2026年10月1日');
    expect(formatLessonDate(null)).toBe('');
    expect(formatLessonDate('invalid')).toBe('invalid');
  });
});
