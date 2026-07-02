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
    <div className="space-y-5 rounded-2xl border border-hairline bg-card p-5 shadow-sm">
      <div className="flex items-center justify-center gap-3 sm:gap-5">
        <button
          onClick={() => onSkip(-SKIP_MEASURES)}
          className="flex h-12 items-center justify-center rounded-full bg-paper-soft px-4 text-sm font-medium text-ink-soft transition hover:bg-hairline active:scale-95"
        >
          ◀◀ {SKIP_MEASURES}
        </button>
        <button
          onClick={onTogglePlay}
          aria-label={isPlaying ? '一時停止' : '再生'}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-2xl text-paper shadow-md transition hover:bg-accent-dark active:scale-95"
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <button
          onClick={() => onSkip(SKIP_MEASURES)}
          className="flex h-12 items-center justify-center rounded-full bg-paper-soft px-4 text-sm font-medium text-ink-soft transition hover:bg-hairline active:scale-95"
        >
          {SKIP_MEASURES} ▶▶
        </button>
      </div>

      <div>
        <div className="mb-2 flex justify-between text-sm font-medium text-ink-soft">
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
          className="h-11 w-full [accent-color:var(--color-accent)]"
          aria-label="小節シーク"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-sm font-medium text-ink-soft">
          <span>テンポ</span>
          <span className="flex items-center gap-1.5 text-base text-ink">
            <span className="tabular-nums">♩ =</span>
            <input
              type="number"
              min={minBpm}
              max={maxBpm}
              value={currentBpm}
              onChange={(e) => handleBpmChange(Number(e.target.value))}
              className="h-9 w-16 rounded-lg border border-hairline bg-paper px-2 text-right text-base tabular-nums outline-none focus:border-accent"
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
          className="h-11 w-full [accent-color:var(--color-accent)]"
          aria-label="テンポ(BPM)"
        />
      </div>
    </div>
  );
}
