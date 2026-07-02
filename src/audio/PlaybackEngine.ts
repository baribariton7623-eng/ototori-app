import * as Tone from 'tone';
import type { Movement } from '../types/music';
import { createTonePart, type PartHighlightEvent, type PartPlaybackEvent } from './buildPart';
import {
  effectiveQuarterBpm,
  measureAtBeat,
  measureStartBeat,
  movementMeasureCount,
  quarterBeatToTicks,
  tempoAtBeat,
  ticksToQuarterBeat,
  toMusicBeat,
  toTransportBeat,
} from './measureMap';

export type NoteChangeListener = (partId: string, event: PartHighlightEvent) => void;

interface PartChannel {
  synth: Tone.PolySynth;
  volume: Tone.Volume;
  tonePart: Tone.Part<[string, PartPlaybackEvent]>;
}

const OSCILLATOR_TYPES = ['triangle', 'sine', 'sawtooth', 'square'] as const;

/** 0-100(%)の音量を、100%=0dB・0%=無音として対数スケールのdBへ変換する */
function percentToDb(percent: number): number {
  if (percent <= 0) return Number.NEGATIVE_INFINITY;
  return 20 * Math.log10(percent / 100);
}

/**
 * 1楽章分のTone.js再生を管理するフレームワーク非依存のクラス。
 * Tone.Transport はモジュール単位のグローバルシングルトンのため、
 * 同時に有効なインスタンスは1つまでを前提とする(画面遷移時は必ずdispose()すること)。
 */
export class PlaybackEngine {
  private readonly movement: Movement;
  private readonly limiter: Tone.Limiter;
  private readonly channels = new Map<string, PartChannel>();
  private tempoMultiplier = 1;
  private tempoScheduleIds: number[] = [];
  private noteChangeListener: NoteChangeListener | null = null;
  private readonly handleLoop = () => this.applyTempoAutomation();
  readonly measureCount: number;
  readonly minMeasure: number;

  constructor(movement: Movement) {
    this.movement = movement;
    this.measureCount = movementMeasureCount(movement);
    this.minMeasure = movement.pickupBeats ? 0 : 1;
    this.limiter = new Tone.Limiter(-1).toDestination();

    movement.parts.forEach((part, index) => {
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: OSCILLATOR_TYPES[index % OSCILLATOR_TYPES.length] },
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.8, release: 0.3 },
      });
      const volume = new Tone.Volume(0);
      synth.connect(volume);
      volume.connect(this.limiter);

      const tonePart = createTonePart(part, synth, Tone.Transport.PPQ, (event) => {
        this.noteChangeListener?.(part.id, event);
      });

      this.channels.set(part.id, { synth, volume, tonePart });
    });

    Tone.Transport.on('loop', this.handleLoop);
    this.applyTempoAutomation();
  }

  onNoteChange(listener: NoteChangeListener | null): void {
    this.noteChangeListener = listener;
  }

  setPartMuted(partId: string, muted: boolean): void {
    const channel = this.channels.get(partId);
    if (!channel) return;
    channel.volume.mute = muted;
  }

  setPartVolume(partId: string, percent: number): void {
    const channel = this.channels.get(partId);
    if (!channel) return;
    channel.volume.volume.value = percentToDb(percent);
  }

  setTempoMultiplier(multiplier: number): void {
    this.tempoMultiplier = multiplier;
    this.applyTempoAutomation();
  }

  get tempoMultiplierValue(): number {
    return this.tempoMultiplier;
  }

  get isPlaying(): boolean {
    return Tone.Transport.state === 'started';
  }

  get isLooping(): boolean {
    return Tone.Transport.loop === true;
  }

  async play(): Promise<void> {
    await Tone.start();
    Tone.Transport.start();
  }

  pause(): void {
    Tone.Transport.pause();
  }

  stop(): void {
    Tone.Transport.stop();
    this.applyTempoAutomation();
  }

  /** 現在のTransport位置が属する小節番号(弱起があれば0、以降1,2,3...) */
  getCurrentMeasure(): number {
    return measureAtBeat(this.ticksToMusicBeat(Tone.Transport.ticks), this.movement);
  }

  seekToMeasure(measure: number): void {
    const clamped = Math.max(this.minMeasure, Math.min(measure, this.measureCount));
    const musicBeat = measureStartBeat(clamped, this.movement);
    Tone.Transport.ticks = Math.max(0, this.musicBeatToTicks(musicBeat));
    this.applyTempoAutomation();
  }

  skipMeasures(delta: number): void {
    this.seekToMeasure(this.getCurrentMeasure() + delta);
  }

  setLoopRegion(startMeasure: number, endMeasure: number): void {
    const startBeat = measureStartBeat(startMeasure, this.movement);
    const endBeat = measureStartBeat(endMeasure, this.movement);
    Tone.Transport.loopStart = `${this.musicBeatToTicks(startBeat)}i`;
    Tone.Transport.loopEnd = `${this.musicBeatToTicks(endBeat)}i`;
    Tone.Transport.loop = true;
  }

  clearLoop(): void {
    Tone.Transport.loop = false;
  }

  dispose(): void {
    Tone.Transport.stop();
    Tone.Transport.off('loop', this.handleLoop);
    Tone.Transport.loop = false;
    for (const id of this.tempoScheduleIds) Tone.Transport.clear(id);
    this.tempoScheduleIds = [];
    for (const channel of this.channels.values()) {
      channel.tonePart.dispose();
      channel.synth.dispose();
      channel.volume.dispose();
    }
    this.channels.clear();
    this.limiter.dispose();
  }

  private musicBeatToTicks(musicBeat: number): number {
    return quarterBeatToTicks(toTransportBeat(musicBeat, this.movement), Tone.Transport.PPQ);
  }

  private ticksToMusicBeat(ticks: number): number {
    return toMusicBeat(ticksToQuarterBeat(ticks, Tone.Transport.PPQ), this.movement);
  }

  /**
   * Transport.bpm のオートメーションを、現在位置から先の tempoEvents に基づき再構築する。
   * シーク・テンポ倍率変更・ループ1周ごと(AudioParamの自動化は一度きりのため)に呼び出す。
   * 将来のテンポ変更は Transport.schedule で「そのtickに到達した実時刻」に
   * setValueAtTime するため、tick→秒の変換をTransport自身の(既に確定した)
   * テンポ曲線に委ねられ、手動で秒数換算する必要がない。
   */
  private applyTempoAutomation(): void {
    for (const id of this.tempoScheduleIds) Tone.Transport.clear(id);
    this.tempoScheduleIds = [];

    const currentMusicBeat = this.ticksToMusicBeat(Tone.Transport.ticks);
    Tone.Transport.bpm.cancelScheduledValues(Tone.now());
    const currentBpm = tempoAtBeat(currentMusicBeat, this.movement.tempoEvents);
    Tone.Transport.bpm.setValueAtTime(
      effectiveQuarterBpm(currentBpm, this.movement, this.tempoMultiplier),
      Tone.now(),
    );

    for (const event of this.movement.tempoEvents) {
      if (event.atBeat <= currentMusicBeat + 1e-6) continue;
      const ticks = this.musicBeatToTicks(event.atBeat);
      const id = Tone.Transport.schedule((time) => {
        Tone.Transport.bpm.setValueAtTime(
          effectiveQuarterBpm(event.bpm, this.movement, this.tempoMultiplier),
          time,
        );
      }, `${ticks}i`);
      this.tempoScheduleIds.push(id);
    }
  }
}
