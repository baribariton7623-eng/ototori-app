import { measureStartBeat, quarterBeatsPerMeasure } from '../../src/audio/measureMap';
import type { Movement, NoteOrRest, Part, TempoEvent, TimeSignature } from '../../src/types/music';
import type { ParsedMeasure, ParsedPart, ParsedScore } from './parseMusicXml';

const EPS = 1e-6;

export interface ToInternalOptions {
  movementId: string;
  movementTitle?: string;
  /** 基準BPMが何を1拍とするかの四分音符換算値。MVPでは通常1(四分音符=1拍) */
  beatUnit?: number;
  /** 楽章内にテンポ指定が一つも無い場合のフォールバックBPM */
  defaultBpm?: number;
}

/** 先頭小節の拍数合計が、その拍子の1小節分に満たない場合を弱起とみなす */
function detectPickupBeats(firstMeasure: ParsedMeasure): number | undefined {
  const qbpm = quarterBeatsPerMeasure(firstMeasure.timeSignature);
  const contentBeats = firstMeasure.events
    .filter((event) => !event.isChordExtra)
    .reduce((sum, event) => sum + event.beats, 0);
  return contentBeats < qbpm - EPS ? contentBeats : undefined;
}

/**
 * <tie type="start">/<tie type="stop"> のペアを合算し、和音の2音目以降
 * (isChordExtra)を除いた直列のNoteOrRest列を作る。3音以上の連続タイにも対応する。
 */
function mergeTies(part: ParsedPart): NoteOrRest[] {
  const flat = part.measures.flatMap((measure) => measure.events).filter((event) => !event.isChordExtra);
  const result: NoteOrRest[] = [];
  let i = 0;
  while (i < flat.length) {
    const event = flat[i];
    if (event.kind === 'rest') {
      result.push({ type: 'rest', beats: event.beats });
      i += 1;
      continue;
    }
    let beats = event.beats;
    let cursor = i;
    while (flat[cursor].tieStart) {
      const next = flat[cursor + 1];
      if (!next || next.kind !== 'note' || next.pitch !== event.pitch || !next.tieStop) {
        throw new Error(
          `[${part.name}] タイの対応が取れません(pitch=${event.pitch}、${cursor + 1}番目のイベント付近)`,
        );
      }
      beats += next.beats;
      cursor += 1;
    }
    result.push({ type: 'note', pitch: event.pitch as string, beats });
    i = cursor + 1;
  }
  return result;
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
  return slug || 'part';
}

export function toInternalMovement(score: ParsedScore, options: ToInternalOptions): Movement {
  if (score.parts.length === 0) {
    throw new Error('パートが見つかりません(<part>要素が0件)');
  }
  const referencePart = score.parts[0];
  const firstMeasure = referencePart.measures[0];
  if (!firstMeasure) {
    throw new Error(`パート「${referencePart.name}」に小節が見つかりません`);
  }

  const timeSignature: TimeSignature = firstMeasure.timeSignature;
  const rawPickupBeats = detectPickupBeats(firstMeasure);
  const hasPickup = rawPickupBeats !== undefined && rawPickupBeats > EPS;
  const pickupBeats = hasPickup ? rawPickupBeats : undefined;
  const movementShape = { timeSignature, pickupBeats };

  // MusicXML上の小節出現順(1始まり)を、アプリの小節番号(弱起=0、以降1,2,3...)へ変換する
  const toAppMeasureNumber = (xmlIndex: number) => (hasPickup ? xmlIndex - 1 : xmlIndex);

  const defaultBpm = options.defaultBpm ?? 120;
  const tempoEvents: TempoEvent[] = [];
  for (const measure of referencePart.measures) {
    if (measure.tempoBpm !== undefined) {
      tempoEvents.push({
        atBeat: measureStartBeat(toAppMeasureNumber(measure.index), movementShape),
        bpm: measure.tempoBpm,
      });
    }
  }
  const movementStartBeat = measureStartBeat(hasPickup ? 0 : 1, movementShape);
  if (tempoEvents.length === 0 || tempoEvents[0].atBeat > movementStartBeat + EPS) {
    tempoEvents.unshift({ atBeat: movementStartBeat, bpm: defaultBpm });
  }
  tempoEvents.sort((a, b) => a.atBeat - b.atBeat);

  const parts: Part[] = score.parts.map((part) => ({
    id: slugify(part.name || part.id),
    label: part.name,
    events: mergeTies(part),
  }));

  return {
    id: options.movementId,
    title: options.movementTitle ?? score.workTitle,
    timeSignature,
    beatUnit: options.beatUnit ?? 1,
    pickupBeats,
    tempoEvents,
    parts,
  };
}
