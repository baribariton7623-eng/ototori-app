import { describe, expect, it } from 'vitest';
import { filterComposerGroups, groupByComposer, toHalfWidth } from '../composerSearch';
import type { WorkMeta } from '../../types/music';

// テスト用の架空データ(実在の楽曲データではない)
const sampleWorks: WorkMeta[] = [
  { id: 'w-beethoven-9', title: '交響曲第九番', composer: 'ベートーヴェン', composerSortKey: 1770, movements: [] },
  { id: 'w-bach-matthew', title: 'マタイ受難曲', composer: 'バッハ', composerSortKey: 1685, movements: [] },
  { id: 'w-bach-mass', title: 'ロ短調ミサ', composer: 'バッハ', composerSortKey: 1685, movements: [] },
  { id: 'w-handel-messiah', title: 'メサイア', composer: 'ヘンデル', composerSortKey: 1685, movements: [] },
  { id: 'w-unknown', title: 'テスト曲', composer: '不明', movements: [] },
];

describe('toHalfWidth', () => {
  it('全角数字を半角に変換する', () => {
    expect(toHalfWidth('１７７０')).toBe('1770');
  });
  it('全角アルファベットを半角に変換する', () => {
    expect(toHalfWidth('ＢＷＶ')).toBe('BWV');
  });
  it('半角文字はそのまま', () => {
    expect(toHalfWidth('1770')).toBe('1770');
  });
});

describe('groupByComposer', () => {
  it('同じ作曲家の作品をまとめる', () => {
    const groups = groupByComposer(sampleWorks);
    const bach = groups.find((g) => g.composer === 'バッハ');
    expect(bach?.works).toHaveLength(2);
  });

  it('生年昇順(時代順)に並べる', () => {
    const groups = groupByComposer(sampleWorks);
    const composers = groups.map((g) => g.composer);
    // バッハ・ヘンデル(1685、同着なので入力順を維持)→ベートーヴェン(1770)→不明(末尾)
    expect(composers).toEqual(['バッハ', 'ヘンデル', 'ベートーヴェン', '不明']);
  });

  it('生年不明の作曲家は末尾に配置される', () => {
    const groups = groupByComposer(sampleWorks);
    expect(groups[groups.length - 1].composer).toBe('不明');
    expect(groups[groups.length - 1].sortKey).toBeNull();
  });
});

describe('filterComposerGroups', () => {
  const groups = groupByComposer(sampleWorks);

  it('空文字なら全件そのまま返す', () => {
    expect(filterComposerGroups(groups, '')).toEqual(groups);
  });

  it('作曲家名の部分一致で、その作曲家の全作品を返す', () => {
    const result = filterComposerGroups(groups, 'バッハ');
    expect(result).toHaveLength(1);
    expect(result[0].works.map((w) => w.title)).toEqual(['マタイ受難曲', 'ロ短調ミサ']);
  });

  it('作品タイトルの部分一致で、該当作品のみに絞り込む', () => {
    const result = filterComposerGroups(groups, 'メサイア');
    expect(result).toHaveLength(1);
    expect(result[0].composer).toBe('ヘンデル');
    expect(result[0].works.map((w) => w.title)).toEqual(['メサイア']);
  });

  it('作曲家名が一致する場合はタイトル一致より優先し全作品を残す', () => {
    const result = filterComposerGroups(groups, 'バッハ');
    expect(result[0].works).toHaveLength(2);
  });

  it('全角文字で入力してもヒットする(IME起因の不具合の再発防止)', () => {
    const withNumeric: WorkMeta[] = [
      { id: 'w-bwv140', title: 'BWV140 目覚めよと呼ぶ声あり', composer: 'バッハ', composerSortKey: 1685, movements: [] },
    ];
    const g = groupByComposer(withNumeric);
    expect(filterComposerGroups(g, 'ＢＷＶ１４０')).toHaveLength(1);
  });

  it('該当なしなら空配列', () => {
    expect(filterComposerGroups(groups, '存在しない曲名XYZ')).toEqual([]);
  });
});
