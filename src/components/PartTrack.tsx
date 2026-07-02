import type { PartHighlightEvent } from '../audio/buildPart';

interface PartTrackProps {
  label: string;
  muted: boolean;
  volume: number;
  currentNote?: PartHighlightEvent;
  onToggleMute: () => void;
  onVolumeChange: (value: number) => void;
}

export default function PartTrack({
  label,
  muted,
  volume,
  currentNote,
  onToggleMute,
  onVolumeChange,
}: PartTrackProps) {
  const noteLabel =
    currentNote?.type === 'note' ? currentNote.pitch : currentNote?.type === 'rest' ? '(休符)' : '—';

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-hairline bg-card p-4 shadow-sm">
      <button
        onClick={onToggleMute}
        className={`flex h-11 shrink-0 items-center justify-center rounded-full px-4 text-sm font-semibold transition active:scale-95 ${
          muted ? 'bg-paper-soft text-ink-faint' : 'bg-accent text-paper'
        }`}
      >
        {muted ? 'ミュート中' : '再生中'}
      </button>
      <div className="w-20 shrink-0 truncate text-base font-semibold text-ink sm:w-28">{label}</div>
      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        disabled={muted}
        onChange={(e) => onVolumeChange(Number(e.target.value))}
        className="h-11 min-w-24 flex-1 [accent-color:var(--color-accent)] disabled:opacity-40"
        aria-label={`${label}の音量`}
      />
      <div className="w-16 shrink-0 text-right text-base font-medium tabular-nums text-ink-soft">
        {noteLabel}
      </div>
    </div>
  );
}
