import { useEffect, useState } from 'react';
import { PlaybackEngine } from '../audio/PlaybackEngine';
import type { PartHighlightEvent } from '../audio/buildPart';
import type { Movement } from '../types/music';

/** シークバー等の高頻度更新を間引くポーリング間隔(ms)。音符ごとのハイライトはこれとは別に即時反映する */
const POLL_INTERVAL_MS = 80;

export interface UsePlaybackEngineResult {
  engine: PlaybackEngine | null;
  isPlaying: boolean;
  currentMeasure: number;
  currentNotes: Record<string, PartHighlightEvent | undefined>;
  /** engineの状態をReact stateへ即時反映する(seek/skip直後などに呼ぶとUIの追従が速くなる) */
  refresh: () => void;
}

export function usePlaybackEngine(movement: Movement | null): UsePlaybackEngineResult {
  const [engine, setEngine] = useState<PlaybackEngine | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMeasure, setCurrentMeasure] = useState(0);
  const [currentNotes, setCurrentNotes] = useState<Record<string, PartHighlightEvent | undefined>>({});

  useEffect(() => {
    if (!movement) {
      setEngine(null);
      return;
    }
    const nextEngine = new PlaybackEngine(movement);
    nextEngine.onNoteChange((partId, event) => {
      setCurrentNotes((prev) => ({ ...prev, [partId]: event }));
    });
    setCurrentNotes({});
    setCurrentMeasure(nextEngine.getCurrentMeasure());
    setIsPlaying(false);
    setEngine(nextEngine);
    return () => {
      nextEngine.dispose();
    };
  }, [movement]);

  useEffect(() => {
    if (!engine) return;
    let raf = 0;
    let lastUpdate = 0;
    const tick = (timestamp: number) => {
      if (timestamp - lastUpdate >= POLL_INTERVAL_MS) {
        lastUpdate = timestamp;
        setIsPlaying(engine.isPlaying);
        setCurrentMeasure(engine.getCurrentMeasure());
        // 末尾(ループ無効時)に到達したら自動停止する
        if (engine.isPlaying && !engine.isLooping && engine.getCurrentMeasure() > engine.measureCount) {
          engine.stop();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  const refresh = () => {
    if (!engine) return;
    setIsPlaying(engine.isPlaying);
    setCurrentMeasure(engine.getCurrentMeasure());
  };

  return { engine, isPlaying, currentMeasure, currentNotes, refresh };
}
