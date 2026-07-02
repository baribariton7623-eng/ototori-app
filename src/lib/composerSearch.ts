import type { WorkMeta } from '../types/music';

export interface ComposerGroup {
  composer: string;
  /** 生年(時代順ソート用)。作品間で値が割れている場合は最小値を採用する */
  sortKey: number | null;
  works: WorkMeta[];
}

/** 全角英数字(IME入力で「１４０」のようになりがちなもの)を半角に変換する */
export function toHalfWidth(value: string): string {
  return value.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

/** 作品一覧を作曲家ごとにまとめ、生年の昇順(時代順)に並べる。生年不明の作曲家は末尾に五十音順で配置する */
export function groupByComposer(works: WorkMeta[]): ComposerGroup[] {
  const groups = new Map<string, ComposerGroup>();
  for (const work of works) {
    const existing = groups.get(work.composer);
    if (existing) {
      existing.works.push(work);
      if (work.composerSortKey !== undefined) {
        existing.sortKey =
          existing.sortKey === null ? work.composerSortKey : Math.min(existing.sortKey, work.composerSortKey);
      }
    } else {
      groups.set(work.composer, {
        composer: work.composer,
        sortKey: work.composerSortKey ?? null,
        works: [work],
      });
    }
  }

  return [...groups.values()].sort((a, b) => {
    if (a.sortKey === null && b.sortKey === null) return a.composer.localeCompare(b.composer, 'ja');
    if (a.sortKey === null) return 1;
    if (b.sortKey === null) return -1;
    return a.sortKey - b.sortKey;
  });
}

/**
 * 検索語で作曲家グループを絞り込む。作曲家名に一致すればその作曲家の全作品を、
 * 作品タイトルのみに一致すればその作品だけを残す。大文字小文字・全角半角の違いは無視する。
 */
export function filterComposerGroups(groups: ComposerGroup[], query: string): ComposerGroup[] {
  const q = toHalfWidth(query).trim().toLowerCase();
  if (!q) return groups;

  const result: ComposerGroup[] = [];
  for (const group of groups) {
    const composerMatches = toHalfWidth(group.composer).toLowerCase().includes(q);
    if (composerMatches) {
      result.push(group);
      continue;
    }
    const matchingWorks = group.works.filter((work) => toHalfWidth(work.title).toLowerCase().includes(q));
    if (matchingWorks.length > 0) {
      result.push({ ...group, works: matchingWorks });
    }
  }
  return result;
}
