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
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-gray-900 p-3">
      <button
        onClick={onToggleMute}
        className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
          muted ? 'bg-gray-800 text-gray-500' : 'bg-indigo-600 text-white'
        }`}
      >
        {muted ? 'ミュート中' : '再生中'}
      </button>
      <div className="w-24 shrink-0 truncate font-medium">{label}</div>
      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        disabled={muted}
        onChange={(e) => onVolumeChange(Number(e.target.value))}
        className="min-w-32 flex-1 disabled:opacity-40"
        aria-label={`${label}の音量`}
      />
      <div className="w-16 shrink-0 text-right text-sm tabular-nums text-gray-400">{noteLabel}</div>
    </div>
  );
}
