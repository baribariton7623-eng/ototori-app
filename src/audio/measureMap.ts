import type { Movement, Part, TempoEvent, TimeSignature } from '../types/music';

/**
 * 小節番号 <-> 拍(四分音符=1の軸) <-> ティック の変換を1箇所に集約する。
 * 弱起がある楽章では「小節0」を弱起(不完全小節)として扱い、
 * beat 0 は最初の完全小節(小節1)の頭に一致する。
 */

export function quarterBeatsPerMeasure(ts: TimeSignature): number {
  return ts.beats * (4 / ts.beatType);
}

/** 指定した小節番号の開始位置を、楽章内の絶対拍位置(四分音符=1軸)で返す */
export function measureStartBeat(
  measure: number,
  movement: Pick<Movement, 'timeSignature' | 'pickupBeats'>,
): number {
  if (measure <= 0) return -(movement.pickupBeats ?? 0);
  const qbpm = quarterBeatsPerMeasure(movement.timeSignature);
  return (measure - 1) * qbpm;
}

/** 絶対拍位置(四分音符=1軸)がどの小節番号に属するかを返す */
export function measureAtBeat(
  beat: number,
  movement: Pick<Movement, 'timeSignature' | 'pickupBeats'>,
): number {
  const pickup = movement.pickupBeats ?? 0;
  if (pickup > 0 && beat < 0) return 0;
  const qbpm = quarterBeatsPerMeasure(movement.timeSignature);
  return Math.floor(beat / qbpm) + 1;
}

export function quarterBeatToTicks(beat: number, ppq: number): number {
  return Math.round(beat * ppq);
}

export function ticksToQuarterBeat(ticks: number, ppq: number): number {
  return ticks / ppq;
}

/** パート内の全イベントの拍数合計(弱起分も含む) */
export function partTotalBeats(part: Part): number {
  return part.events.reduce((sum, event) => sum + event.beats, 0);
}

/**
 * 楽章の総小節数。最も長いパートの終端位置(絶対拍、0=小節1の頭)を
 * 小節グリッドで切り上げて求める。
 */
export function movementMeasureCount(movement: Movement): number {
  const pickup = movement.pickupBeats ?? 0;
  const qbpm = quarterBeatsPerMeasure(movement.timeSignature);
  const endBeat = Math.max(0, ...movement.parts.map((part) => partTotalBeats(part) - pickup));
  if (endBeat <= 0) return 0;
  return Math.ceil(endBeat / qbpm);
}

/**
 * TempoEvent.bpm(既に「四分音符=1拍」換算で統一済み。MusicXMLの<sound tempo>自体が
 * 常にQPM=四分音符/分で表現されるため、変換時点で正規化済み)を、
 * Tone.Transport.bpm へそのまま渡せる値に、テンポ倍率だけ適用して返す。
 *
 * movement.beatUnit は「原典の記譜上、何を1拍としてBPMが表記されていたか」を
 * 示す情報用フィールド(例: 6/8で付点四分=126と印刷されていた場合の記録)であり、
 * bpm値自体は既にbeatUnitとは独立して四分音符換算されているため、ここで
 * 乗算してはいけない(以前は誤って乗算しており、beatUnitが1以外の楽章で
 * 再生速度が実際のテンポ表記からズレるバグがあった)。
 */
export function effectiveQuarterBpm(segmentBpm: number, tempoMultiplier = 1): number {
  return segmentBpm * tempoMultiplier;
}

/**
 * measureStartBeat 等が使う「小節1の頭を0とする拍軸(弱起は負の値)」から、
 * Tone.Transport.ticks が要求する「演奏開始点(弱起があればその先頭)を0とする拍軸」へ変換する。
 * Transport.ticks は負の値を取れないため、この変換で常に0以上になるようにする。
 */
export function toTransportBeat(musicBeat: number, movement: Pick<Movement, 'pickupBeats'>): number {
  return musicBeat + (movement.pickupBeats ?? 0);
}

/** toTransportBeat の逆変換 */
export function toMusicBeat(transportBeat: number, movement: Pick<Movement, 'pickupBeats'>): number {
  return transportBeat - (movement.pickupBeats ?? 0);
}

/** tempoEvents(atBeat昇順)から、指定拍位置で有効なBPMを求める */
export function tempoAtBeat(beat: number, tempoEvents: TempoEvent[]): number {
  let current = tempoEvents[0]?.bpm ?? 120;
  for (const event of tempoEvents) {
    if (event.atBeat <= beat) {
      current = event.bpm;
    } else {
      break;
    }
  }
  return current;
}
