import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseMusicXmlFile, parseMusicXmlString } from '../parseMusicXml';
import { toInternalMovement } from '../toInternalFormat';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../../../content/musicxml/_fixtures');

describe('toInternalMovement — 弱起・タイ・休符フィクスチャ', () => {
  const parsed = parseMusicXmlFile(resolve(FIXTURES_DIR, 'pickup-tie-rest.musicxml'));
  const movement = toInternalMovement(parsed, { movementId: 'fixture-pickup-tie-rest' });

  it('拍子・弱起・基準テンポを正しく抽出する', () => {
    expect(movement.timeSignature).toEqual({ beats: 4, beatType: 4 });
    expect(movement.pickupBeats).toBe(1);
    expect(movement.beatUnit).toBe(1);
  });

  it('先頭のテンポイベントを弱起開始位置(-1拍)に置く', () => {
    expect(movement.tempoEvents).toEqual([{ atBeat: -1, bpm: 72 }]);
  });

  it('タイで結ばれた2つの半音符を1つのイベントに合算する', () => {
    expect(movement.parts).toHaveLength(1);
    const [part] = movement.parts;
    expect(part.id).toBe('test-voice');
    expect(part.label).toBe('Test Voice');
    expect(part.events).toEqual([
      { type: 'note', pitch: 'G4', beats: 1 },
      { type: 'rest', beats: 1 },
      { type: 'note', pitch: 'E4', beats: 1 },
      { type: 'note', pitch: 'C4', beats: 4 },
      { type: 'note', pitch: 'D4', beats: 2 },
      { type: 'note', pitch: 'E4', beats: 1 },
      { type: 'note', pitch: 'F4', beats: 1 },
      { type: 'note', pitch: 'G4', beats: 2 },
    ]);
  });

  it('イベントの拍数合計は小節構成と一致する(弱起1 + 3小節×4拍=13拍)', () => {
    const total = movement.parts[0].events.reduce((sum, e) => sum + e.beats, 0);
    expect(total).toBe(13);
  });
});

describe('toInternalMovement — タイの対応が取れない場合はエラー', () => {
  it('tie start だけで stop が無い場合は例外を投げる', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Broken</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="start"/></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>8</duration></note>
    </measure>
  </part>
</score-partwise>`;
    const parsed = parseMusicXmlString(xml);
    expect(() => toInternalMovement(parsed, { movementId: 'broken' })).toThrow(/タイの対応/);
  });
});

describe('toInternalMovement — 弱起なしの通常小節', () => {
  it('pickupBeatsはundefinedになる', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Plain</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration></note>
    </measure>
  </part>
</score-partwise>`;
    const parsed = parseMusicXmlString(xml);
    const movement = toInternalMovement(parsed, { movementId: 'plain' });
    expect(movement.pickupBeats).toBeUndefined();
    expect(movement.timeSignature).toEqual({ beats: 3, beatType: 4 });
    expect(movement.tempoEvents).toEqual([{ atBeat: 0, bpm: 120 }]);
  });
});
