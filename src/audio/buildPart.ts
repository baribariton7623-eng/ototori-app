import * as Tone from 'tone';
import type { Part } from '../types/music';
import { quarterBeatToTicks } from './measureMap';

export interface PartHighlightEvent {
  type: 'note' | 'rest';
  pitch?: string;
}

export interface PartPlaybackEvent {
  kind: 'note' | 'rest';
  pitch?: string;
  durationTicks: number;
}

/**
 * パートのイベント列(NoteOrRest[])を、Tone.Part用の [tick位置, イベント] 配列に変換する。
 * カーソルは「演奏開始点(弱起があればその先頭)」を0として進めるため、
 * ここでは pickupBeats を意識する必要はない(呼び出し側で解決済みの前提)。
 */
export function buildPartEvents(part: Part, ppq: number): Array<[string, PartPlaybackEvent]> {
  const events: Array<[string, PartPlaybackEvent]> = [];
  let cursorBeat = 0;
  for (const event of part.events) {
    const startTicks = quarterBeatToTicks(cursorBeat, ppq);
    const durationTicks = quarterBeatToTicks(event.beats, ppq);
    if (event.type === 'note') {
      events.push([`${startTicks}i`, { kind: 'note', pitch: event.pitch, durationTicks }]);
    } else {
      events.push([`${startTicks}i`, { kind: 'rest', durationTicks }]);
    }
    cursorBeat += event.beats;
  }
  return events;
}

/**
 * パート1つ分の Tone.Part を構築し、synth への発音とハイライト用コールバックを配線する。
 * 返り値は start(0) 済み(Transport.tickでスケジュール済みだが、実際に鳴るのは
 * Tone.Transport.start() が呼ばれてから)。
 */
export function createTonePart(
  part: Part,
  synth: Tone.PolySynth,
  ppq: number,
  onHighlight: (event: PartHighlightEvent) => void,
): Tone.Part<[string, PartPlaybackEvent]> {
  const events = buildPartEvents(part, ppq);
  const tonePart = new Tone.Part<[string, PartPlaybackEvent]>((time, value) => {
    if (value.kind === 'note' && value.pitch) {
      synth.triggerAttackRelease(value.pitch, `${value.durationTicks}i`, time);
    }
    Tone.Draw.schedule(() => {
      onHighlight(value.kind === 'note' ? { type: 'note', pitch: value.pitch } : { type: 'rest' });
    }, time);
  }, events);
  tonePart.start(0);
  return tonePart;
}
