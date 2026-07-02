import { readFileSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';

/**
 * MusicXML(partwise形式)を、変換に必要な最低限の情報だけを残した
 * 中間表現(ParsedScore)に変換する。テンポ・タイ・弱起の解決といった
 * アプリ固有のロジックは toInternalFormat.ts に譲り、ここではXMLの生の
 * 構造をJSオブジェクトに正規化するところまでを担当する。
 *
 * 既知の制約(MVPスコープ): <backup>/<forward> による同一パート内の
 * 複数声部(voice切り替え)には対応していない。パートごとに単一の
 * 声部のみを前提とする(合唱の各パートを別々のMusicXMLパートとして
 * 書き出す運用を前提とする)。
 */

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export interface ParsedNoteEvent {
  kind: 'note' | 'rest';
  /** kind === 'note' の場合のみ設定 */
  pitch?: string;
  beats: number;
  tieStart: boolean;
  tieStop: boolean;
  /** <chord/> を伴う和音の2音目以降。単声パート前提のため変換時は無視する */
  isChordExtra: boolean;
}

export interface ParsedTimeSignature {
  beats: number;
  beatType: number;
}

export interface ParsedMeasure {
  /** MusicXML上の出現順(1始まり)。number属性の値ではなく出現順を正とする */
  index: number;
  events: ParsedNoteEvent[];
  timeSignature: ParsedTimeSignature;
  /** この小節内に <sound tempo="..."/> があれば設定(複数ある場合は最後のもの) */
  tempoBpm?: number;
}

export interface ParsedPart {
  id: string;
  name: string;
  measures: ParsedMeasure[];
}

export interface ParsedScore {
  workTitle: string;
  parts: ParsedPart[];
}

const ALTER_SYMBOLS: Record<number, string> = {
  [-2]: 'bb',
  [-1]: 'b',
  [0]: '',
  [1]: '#',
  [2]: '##',
};

function pitchToName(pitchNode: { step: string; alter?: number | string; octave: number | string }): string {
  const alter = pitchNode.alter !== undefined ? Number(pitchNode.alter) : 0;
  const symbol = ALTER_SYMBOLS[alter];
  if (symbol === undefined) {
    throw new Error(`未対応の変化記号です(alter=${alter})`);
  }
  return `${pitchNode.step}${symbol}${pitchNode.octave}`;
}

export function parseMusicXmlFile(filePath: string): ParsedScore {
  return parseMusicXmlString(readFileSync(filePath, 'utf-8'));
}

export function parseMusicXmlString(xml: string): ParsedScore {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: true,
    parseAttributeValue: true,
    trimValues: true,
  });
  const doc = parser.parse(xml);
  const root = doc['score-partwise'];
  if (!root) {
    throw new Error('score-partwise ルート要素が見つかりません(partwise形式のMusicXMLのみ対応)');
  }

  const workTitle: string = root.work?.['work-title'] ?? root['movement-title'] ?? 'Untitled';

  const scorePartEntries = toArray(root['part-list']?.['score-part']);
  const partNameById = new Map<string, string>();
  for (const entry of scorePartEntries) {
    const id = String(entry['@_id']);
    const name = entry['part-name'] !== undefined ? String(entry['part-name']) : id;
    partNameById.set(id, name);
  }

  const xmlParts = toArray(root.part);
  const parts: ParsedPart[] = xmlParts.map((xmlPart) => parsePart(xmlPart, partNameById));

  return { workTitle, parts };
}

function parsePart(
  xmlPart: Record<string, unknown>,
  partNameById: Map<string, string>,
): ParsedPart {
  const id = String(xmlPart['@_id']);
  const name = partNameById.get(id) ?? id;

  let divisions = 1;
  let timeSignature: ParsedTimeSignature = { beats: 4, beatType: 4 };
  const measures: ParsedMeasure[] = [];

  const xmlMeasures = toArray(xmlPart.measure as Record<string, unknown> | Record<string, unknown>[]);
  xmlMeasures.forEach((xmlMeasure, i) => {
    const attributes = xmlMeasure.attributes as Record<string, unknown> | undefined;
    if (attributes?.divisions !== undefined) {
      divisions = Number(attributes.divisions);
    }
    if (attributes?.time !== undefined) {
      const timeNode = attributes.time as Record<string, unknown>;
      timeSignature = {
        beats: Number(timeNode.beats),
        beatType: Number(timeNode['beat-type']),
      };
    }

    let tempoBpm: number | undefined;
    for (const direction of toArray(xmlMeasure.direction as Record<string, unknown> | Record<string, unknown>[])) {
      const sound = direction.sound as Record<string, unknown> | undefined;
      if (sound?.['@_tempo'] !== undefined) {
        tempoBpm = Number(sound['@_tempo']);
      }
    }

    const events: ParsedNoteEvent[] = [];
    for (const note of toArray(xmlMeasure.note as Record<string, unknown> | Record<string, unknown>[])) {
      const event = parseNote(note, divisions);
      if (event) events.push(event);
    }

    measures.push({ index: i + 1, events, timeSignature, tempoBpm });
  });

  return { id, name, measures };
}

function parseNote(
  note: Record<string, unknown>,
  divisions: number,
): ParsedNoteEvent | undefined {
  // グレース音符(装飾音、実質長さを持たない)は現状スキップする
  if (note.grace !== undefined) return undefined;

  const durationDivisions = note.duration !== undefined ? Number(note.duration) : 0;
  const beats = durationDivisions / divisions;
  const isChordExtra = note.chord !== undefined;

  const ties = toArray(note.tie as Record<string, unknown> | Record<string, unknown>[]);
  const tieStart = ties.some((t) => t['@_type'] === 'start');
  const tieStop = ties.some((t) => t['@_type'] === 'stop');

  if (note.rest !== undefined) {
    return { kind: 'rest', beats, tieStart: false, tieStop: false, isChordExtra: false };
  }
  if (note.pitch !== undefined) {
    const pitch = pitchToName(note.pitch as { step: string; alter?: number; octave: number });
    return { kind: 'note', pitch, beats, tieStart, tieStop, isChordExtra };
  }
  // pitchもrestも無い(打楽器の<unpitched/>など)は現状未対応のためスキップ
  return undefined;
}
