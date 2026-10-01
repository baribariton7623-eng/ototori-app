import { useMemo } from 'react';
import type { Slot } from '../api/types';
import { WEEKDAY_JA, dateKey, fmtTime } from '../lib/format';

interface Props {
  slots: Slot[];
  /** 選択中の開始時刻。複数選択では配列の順が希望順 */
  selected: string | null | string[];
  onSelect: (startAt: string) => void;
  emptyText?: string;
}

/** 空き枠を日付ごとにグループ化して表示する。複数選択のときは選んだ順の番号(第1〜)をボタンに出す */
export function SlotPicker({ slots, selected, onSelect, emptyText = 'この期間に空き枠はありません' }: Props) {
  const ranks = Array.isArray(selected) ? selected : selected ? [selected] : [];
  const multi = Array.isArray(selected);
  const groups = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = dateKey(s.startAt);
      const list = map.get(k) ?? [];
      list.push(s);
      map.set(k, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [slots]);

  if (groups.length === 0) return <div className="text-sm text-stone-500 py-4 text-center">{emptyText}</div>;

  return (
    <div className="space-y-3">
      {groups.map(([key, list]) => {
        const d = new Date(`${key}T00:00:00+09:00`);
        const wd = WEEKDAY_JA[d.getDay()];
        const [, m, day] = key.split('-');
        return (
          <div key={key} data-testid="slot-day" data-date={key}>
            <div className={`text-xs font-medium mb-1 ${wd === '日' ? 'text-red-600' : wd === '土' ? 'text-sky-700' : 'text-stone-600'}`}>
              {Number(m)}/{Number(day)} ({wd})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {list.map((s) => {
                const rank = ranks.indexOf(s.startAt);
                const active = rank >= 0;
                return (
                  <button
                    key={s.startAt}
                    type="button"
                    aria-pressed={active}
                    data-start={s.startAt}
                    onClick={() => onSelect(s.startAt)}
                    className={`relative rounded-md border px-2.5 py-1 text-sm ${
                      active ? 'bg-emerald-700 border-emerald-700 text-white' : 'bg-white border-stone-300 hover:bg-emerald-50'
                    }`}
                  >
                    {fmtTime(s.startAt)}
                    {multi && active && (
                      <span className="absolute -top-2 -right-2 rounded-full bg-amber-500 text-white text-[10px] leading-none px-1.5 py-1">
                        {rank + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
