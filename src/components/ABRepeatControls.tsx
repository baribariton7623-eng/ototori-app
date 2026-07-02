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
    <div className="space-y-3 rounded-lg bg-gray-900 p-4">
      <div className="text-sm font-medium text-gray-300">A-Bリピート(区間反復)</div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1">
          開始
          <input
            type="number"
            min={minMeasure}
            max={measureCount}
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
            className="w-16 rounded bg-gray-800 px-2 py-1"
          />
        </label>
        <button
          onClick={() => setStart(currentMeasure)}
          className="rounded bg-gray-800 px-2 py-1 text-xs hover:bg-gray-700"
        >
          現在位置
        </button>
        <label className="flex items-center gap-1">
          終了
          <input
            type="number"
            min={minMeasure}
            max={measureCount}
            value={end}
            onChange={(e) => setEnd(Number(e.target.value))}
            className="w-16 rounded bg-gray-800 px-2 py-1"
          />
        </label>
        <button
          onClick={() => setEnd(currentMeasure)}
          className="rounded bg-gray-800 px-2 py-1 text-xs hover:bg-gray-700"
        >
          現在位置
        </button>
      </div>
      <div className="flex gap-2">
        <button
          disabled={start >= end}
          onClick={() => onSetLoopRegion(start, end)}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm hover:bg-indigo-500 disabled:opacity-50"
        >
          {loopRegion ? 'ループを更新' : 'ループ開始'}
        </button>
        {loopRegion && (
          <button
            onClick={onClearLoop}
            className="rounded bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-700"
          >
            ループ解除
          </button>
        )}
      </div>
    </div>
  );
}
