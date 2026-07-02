import { useEffect, useRef, useState } from 'react';
import ABRepeatControls from '../components/ABRepeatControls';
import PartTrack from '../components/PartTrack';
import StartAudioOverlay from '../components/StartAudioOverlay';
import TransportControls from '../components/TransportControls';
import { loadMovement } from '../data/loadMovement';
import { useAuth } from '../hooks/useAuth';
import { usePlaybackEngine } from '../hooks/usePlaybackEngine';
import { useWakeLock } from '../hooks/useWakeLock';
import { loadMuteSettings, saveMuteSettings } from '../lib/muteSettings';
import { recordPractice } from '../lib/practiceHistory';
import type { MovementData } from '../types/music';

interface PlayerScreenProps {
  workId: string;
  movementId: string;
}

interface PartSetting {
  muted: boolean;
  volume: number;
}

export default function PlayerScreen({ workId, movementId }: PlayerScreenProps) {
  const [data, setData] = useState<MovementData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tempoMultiplier, setTempoMultiplier] = useState(1);
  const [loopRegion, setLoopRegionState] = useState<{ start: number; end: number } | null>(null);
  const [partSettings, setPartSettings] = useState<Record<string, PartSetting>>({});
  const { user } = useAuth();
  const hasRecordedPracticeRef = useRef(false);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // 保存済み設定の読み込み(またはログインなしのためスキップ判定)が完了するまでは
  // 保存処理を止めておく。これが無いと、読み込みが完了する前にデフォルト値で
  // 上書き保存されてしまい、以前保存した設定がDB上で消えてしまう競合が起きる。
  const muteSettingsLoadedRef = useRef(false);

  useEffect(() => {
    setData(null);
    setError(null);
    setTempoMultiplier(1);
    setLoopRegionState(null);
    hasRecordedPracticeRef.current = false;
    muteSettingsLoadedRef.current = false;
    loadMovement(workId, movementId)
      .then((movementData) => {
        setData(movementData);
        const initial: Record<string, PartSetting> = {};
        for (const part of movementData.movement.parts) {
          initial[part.id] = { muted: false, volume: 100 };
        }
        setPartSettings(initial);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [workId, movementId]);

  // ログイン済みなら、保存済みのミュート/音量設定を読み込んで初期値に反映する
  useEffect(() => {
    if (!data) return;
    if (!user) {
      muteSettingsLoadedRef.current = true;
      return;
    }
    muteSettingsLoadedRef.current = false;
    loadMuteSettings(user.id, workId, movementId)
      .then((saved) => {
        if (!saved) return;
        setPartSettings((prev) => {
          const merged = { ...prev };
          for (const [partId, setting] of Object.entries(saved)) {
            if (merged[partId]) merged[partId] = setting;
          }
          return merged;
        });
      })
      .finally(() => {
        muteSettingsLoadedRef.current = true;
      });
  }, [data, user, workId, movementId]);

  // ミュート/音量設定が変わるたびデバウンスして保存する(ログイン時、かつ読み込み完了後のみ)
  useEffect(() => {
    if (!user || !data || !muteSettingsLoadedRef.current || Object.keys(partSettings).length === 0) return;
    clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      saveMuteSettings(user.id, workId, movementId, partSettings);
    }, 800);
    return () => clearTimeout(saveDebounceRef.current);
  }, [partSettings, user, data, workId, movementId]);

  const { engine, isPlaying, currentMeasure, currentNotes, refresh } = usePlaybackEngine(
    data?.movement ?? null,
  );
  const { isSupported: wakeLockSupported } = useWakeLock(isPlaying);

  if (error) return <p className="p-6 text-base text-red-700">{error}</p>;
  if (!data || !engine) return <p className="p-6 text-base text-ink-soft">読み込み中...</p>;

  const { movement } = data;
  const minMeasure = engine.minMeasure;

  const handleTogglePlay = async () => {
    if (engine.isPlaying) {
      engine.pause();
    } else {
      await engine.play();
      if (user && !hasRecordedPracticeRef.current) {
        hasRecordedPracticeRef.current = true;
        recordPractice(user.id, workId, movementId);
      }
    }
    refresh();
  };

  const handleTempoChange = (value: number) => {
    setTempoMultiplier(value);
    engine.setTempoMultiplier(value);
  };

  const handleSeek = (measure: number) => {
    engine.seekToMeasure(measure);
    refresh();
  };

  const handleSkip = (delta: number) => {
    engine.skipMeasures(delta);
    refresh();
  };

  const handleSetLoopRegion = (start: number, end: number) => {
    engine.setLoopRegion(start, end);
    setLoopRegionState({ start, end });
  };

  const handleClearLoop = () => {
    engine.clearLoop();
    setLoopRegionState(null);
  };

  const handleToggleMute = (partId: string) => {
    const next = !partSettings[partId]?.muted;
    engine.setPartMuted(partId, next);
    setPartSettings((prev) => ({ ...prev, [partId]: { ...prev[partId], muted: next } }));
  };

  const handleVolumeChange = (partId: string, volume: number) => {
    engine.setPartVolume(partId, volume);
    setPartSettings((prev) => ({ ...prev, [partId]: { ...prev[partId], volume } }));
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <StartAudioOverlay />
      <div className="px-1">
        <p className="text-sm text-ink-soft">{data.workTitle}</p>
        <h2 className="text-2xl font-bold tracking-tight text-ink">{movement.title}</h2>
        {!wakeLockSupported && (
          <p className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-dark">
            ※このブラウザでは画面ロック時の自動停止を防止できません。再生中は画面を点けたままにしてください。
          </p>
        )}
      </div>

      <TransportControls
        isPlaying={isPlaying}
        onTogglePlay={handleTogglePlay}
        baseBpm={movement.tempoEvents[0]?.bpm ?? 120}
        tempoMultiplier={tempoMultiplier}
        onTempoChange={handleTempoChange}
        currentMeasure={currentMeasure}
        minMeasure={minMeasure}
        measureCount={engine.measureCount}
        onSeek={handleSeek}
        onSkip={handleSkip}
      />

      <ABRepeatControls
        minMeasure={minMeasure}
        measureCount={engine.measureCount}
        currentMeasure={currentMeasure}
        loopRegion={loopRegion}
        onSetLoopRegion={handleSetLoopRegion}
        onClearLoop={handleClearLoop}
      />

      <div className="space-y-2">
        {movement.parts.map((part) => (
          <PartTrack
            key={part.id}
            label={part.label}
            muted={partSettings[part.id]?.muted ?? false}
            volume={partSettings[part.id]?.volume ?? 100}
            currentNote={currentNotes[part.id]}
            onToggleMute={() => handleToggleMute(part.id)}
            onVolumeChange={(volume) => handleVolumeChange(part.id, volume)}
          />
        ))}
      </div>
    </div>
  );
}
