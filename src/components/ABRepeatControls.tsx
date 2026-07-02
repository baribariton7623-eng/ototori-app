import { useState } from 'react';

interface ABRepeatControlsProps {
  minMeasure: number;
  measureCount: number;
  currentMeasure: number;
  loopRegion: { start: number; end: number } | null;
  onSetLoopRegion: (start: number, end: number) => void;
  onClearLoop: () => void;
}

export default function ABRepeatControls({
  minMeasure,
  measureCount,
  currentMeasure,
  loopRegion,
  onSetLoopRegion,
  onClearLoop,
}: ABRepeatControlsProps) {
  const [start, setStart] = useState(loopRegion?.start ?? minMeasure);
  const [end, setEnd] = useState(loopRegion?.end ?? Math.min(minMeasure + 4, measureCount));

  return (
    <div className="space-y-3 rounded-2xl border border-hairline bg-card p-5 shadow-sm">
      <div className="text-base font-semibold text-ink">A-Bリピート(区間反復)</div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-ink-soft">
          開始
          <input
            type="number"
            min={minMeasure}
            max={measureCount}
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
            className="h-10 w-16 rounded-lg border border-hairline bg-paper px-2 text-base text-ink outline-none focus:border-accent"
          />
        </label>
        <button
          onClick={() => setStart(currentMeasure)}
          className="h-10 rounded-full bg-paper-soft px-3 text-sm font-medium text-ink-soft transition hover:bg-hairline active:scale-95"
        >
          現在位置
        </button>
        <label className="flex items-center gap-2 text-sm font-medium text-ink-soft">
          終了
          <input
            type="number"
            min={minMeasure}
            max={measureCount}
            value={end}
            onChange={(e) => setEnd(Number(e.target.value))}
            className="h-10 w-16 rounded-lg border border-hairline bg-paper px-2 text-base text-ink outline-none focus:border-accent"
          />
        </label>
        <button
          onClick={() => setEnd(currentMeasure)}
          className="h-10 rounded-full bg-paper-soft px-3 text-sm font-medium text-ink-soft transition hover:bg-hairline active:scale-95"
        >
          現在位置
        </button>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          disabled={start >= end}
          onClick={() => onSetLoopRegion(start, end)}
          className="h-11 rounded-full bg-accent px-5 text-sm font-semibold text-paper transition hover:bg-accent-dark active:scale-95 disabled:opacity-40"
        >
          {loopRegion ? 'ループを更新' : 'ループ開始'}
        </button>
        {loopRegion && (
          <button
            onClick={onClearLoop}
            className="h-11 rounded-full bg-paper-soft px-5 text-sm font-medium text-ink-soft transition hover:bg-hairline active:scale-95"
          >
            ループ解除
          </button>
        )}
      </div>
    </div>
  );
}
