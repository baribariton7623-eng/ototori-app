import { useState } from 'react';

interface TransportControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  /** 楽章冒頭の基準BPM(四分音符=1拍換算)。テンポスライダー・数値入力の基準点として使う */
  baseBpm: number;
  tempoMultiplier: number;
  onTempoChange: (value: number) => void;
  currentMeasure: number;
  minMeasure: number;
  measureCount: number;
  onSeek: (measure: number) => void;
  onSkip: (delta: number) => void;
}

const SKIP_MEASURES = 4;

export default function TransportControls({
  isPlaying,
  onTogglePlay,
  baseBpm,
  tempoMultiplier,
  onTempoChange,
  currentMeasure,
  minMeasure,
  measureCount,
  onSeek,
  onSkip,
}: TransportControlsProps) {
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const sliderValue = seekDraft ?? currentMeasure;
  const maxMeasure = Math.max(measureCount, minMeasure);

  const currentBpm = Math.round(baseBpm * tempoMultiplier);
  const minBpm = Math.round(baseBpm * 0.5);
  const maxBpm = Math.round(baseBpm * 1.5);
  const handleBpmChange = (bpm: number) => {
    const clamped = Math.min(maxBpm, Math.max(minBpm, bpm));
    onTempoChange(clamped / baseBpm);
  };

  return (
    <div className="space-y-4 rounded-lg bg-gray-900 p-4">
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => onSkip(-SKIP_MEASURES)}
          className="rounded-full bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700"
        >
          ◀◀ {SKIP_MEASURES}小節
        </button>
        <button
          onClick={onTogglePlay}
          className="rounded-full bg-indigo-600 px-6 py-3 text-lg font-semibold hover:bg-indigo-500"
        >
          {isPlaying ? '一時停止' : '再生'}
        </button>
        <button
          onClick={() => onSkip(SKIP_MEASURES)}
          className="rounded-full bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700"
        >
          {SKIP_MEASURES}小節 ▶▶
        </button>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-sm text-gray-400">
          <span>小節 {currentMeasure}</span>
          <span>全{measureCount}小節</span>
        </div>
        <input
          type="range"
          min={minMeasure}
          max={maxMeasure}
          value={sliderValue}
          onChange={(e) => {
            const value = Number(e.target.value);
            setSeekDraft(value);
            onSeek(value);
          }}
          onPointerUp={() => setSeekDraft(null)}
          className="w-full"
          aria-label="小節シーク"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-sm text-gray-400">
          <span>テンポ</span>
          <span className="flex items-center gap-1 text-gray-200">
            <span className="tabular-nums">♩ =</span>
            <input
              type="number"
              min={minBpm}
              max={maxBpm}
              value={currentBpm}
              onChange={(e) => handleBpmChange(Number(e.target.value))}
              className="w-14 rounded bg-gray-800 px-1 py-0.5 text-right tabular-nums"
              aria-label="テンポ(BPM、数値入力)"
            />
          </span>
        </div>
        <input
          type="range"
          min={minBpm}
          max={maxBpm}
          value={currentBpm}
          onChange={(e) => handleBpmChange(Number(e.target.value))}
          className="w-full"
          aria-label="テンポ(BPM)"
        />
      </div>
    </div>
  );
}
