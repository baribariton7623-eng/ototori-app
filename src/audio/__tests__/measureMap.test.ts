import { describe, expect, it } from 'vitest';
import {
  effectiveQuarterBpm,
  measureAtBeat,
  measureStartBeat,
  movementMeasureCount,
  partTotalBeats,
  quarterBeatsPerMeasure,
  quarterBeatToTicks,
  tempoAtBeat,
  ticksToQuarterBeat,
  toMusicBeat,
  toTransportBeat,
} from '../measureMap';
import type { Movement, Part } from '../../types/music';

describe('quarterBeatsPerMeasure', () => {
  it('4/4 は4拍', () => {
    expect(quarterBeatsPerMeasure({ beats: 4, beatType: 4 })).toBe(4);
  });
  it('3/4 は3拍', () => {
    expect(quarterBeatsPerMeasure({ beats: 3, beatType: 4 })).toBe(3);
  });
  it('6/8 は四分音符換算で3拍', () => {
    expect(quarterBeatsPerMeasure({ beats: 6, beatType: 8 })).toBe(3);
  });
});

describe('measureStartBeat / measureAtBeat (弱起なし 4/4)', () => {
  const movement: Pick<Movement, 'timeSignature' | 'pickupBeats'> = {
    timeSignature: { beats: 4, beatType: 4 },
  };

  it('小節1はbeat 0から始まる', () => {
    expect(measureStartBeat(1, movement)).toBe(0);
    expect(measureStartBeat(2, movement)).toBe(4);
    expect(measureStartBeat(3, movement)).toBe(8);
  });

  it('beatから小節番号を逆算できる', () => {
    expect(measureAtBeat(0, movement)).toBe(1);
    expect(measureAtBeat(3.5, movement)).toBe(1);
    expect(measureAtBeat(4, movement)).toBe(2);
    expect(measureAtBeat(7.99, movement)).toBe(2);
  });
});

describe('measureStartBeat / measureAtBeat (弱起あり 4/4、pickup=1拍)', () => {
  const movement: Pick<Movement, 'timeSignature' | 'pickupBeats'> = {
    timeSignature: { beats: 4, beatType: 4 },
    pickupBeats: 1,
  };

  it('小節0(弱起)は -1 拍から始まる', () => {
    expect(measureStartBeat(0, movement)).toBe(-1);
  });

  it('小節1はbeat 0から始まる(弱起の影響を受けない)', () => {
    expect(measureStartBeat(1, movement)).toBe(0);
    expect(measureStartBeat(2, movement)).toBe(4);
  });

  it('弱起区間の拍は小節0に属する', () => {
    expect(measureAtBeat(-1, movement)).toBe(0);
    expect(measureAtBeat(-0.5, movement)).toBe(0);
  });

  it('beat 0以降は小節1以降に属する', () => {
    expect(measureAtBeat(0, movement)).toBe(1);
    expect(measureAtBeat(4, movement)).toBe(2);
  });
});

describe('quarterBeatToTicks / ticksToQuarterBeat', () => {
  it('往復変換で元の値に戻る(PPQ=192)', () => {
    const ppq = 192;
    expect(quarterBeatToTicks(1.5, ppq)).toBe(288);
    expect(ticksToQuarterBeat(288, ppq)).toBe(1.5);
  });

  it('三連八分(1/3拍)がPPQ=192で割り切れる', () => {
    const ppq = 192;
    const ticks = quarterBeatToTicks(1 / 3, ppq);
    expect(ticks).toBe(64);
    expect(Number.isInteger(ticks)).toBe(true);
  });
});

describe('partTotalBeats', () => {
  it('note/restのbeatsを合算する', () => {
    const part: Part = {
      id: 'p1',
      label: 'Part 1',
      events: [
        { type: 'note', pitch: 'C4', beats: 1 },
        { type: 'rest', beats: 0.5 },
        { type: 'note', pitch: 'D4', beats: 1.5 },
      ],
    };
    expect(partTotalBeats(part)).toBe(3);
  });
});

describe('movementMeasureCount', () => {
  it('弱起なし、ちょうど2小節分(4/4)', () => {
    const movement: Movement = {
      id: 'm1',
      title: 'Test',
      timeSignature: { beats: 4, beatType: 4 },
      beatUnit: 1,
      tempoEvents: [{ atBeat: 0, bpm: 120 }],
      parts: [
        {
          id: 'p1',
          label: 'Part 1',
          events: [
            { type: 'note', pitch: 'C4', beats: 4 },
            { type: 'note', pitch: 'D4', beats: 4 },
          ],
        },
      ],
    };
    expect(movementMeasureCount(movement)).toBe(2);
  });

  it('弱起1拍を含む場合、弱起分は小節数から除外して計算する', () => {
    const movement: Movement = {
      id: 'm2',
      title: 'Test Pickup',
      timeSignature: { beats: 4, beatType: 4 },
      beatUnit: 1,
      pickupBeats: 1,
      tempoEvents: [{ atBeat: 0, bpm: 120 }],
      parts: [
        {
          id: 'p1',
          label: 'Part 1',
          // 弱起1拍 + 完全4拍 = 合計5拍、コンテンツの実質長は4拍 = ちょうど1小節
          events: [{ type: 'note', pitch: 'C4', beats: 5 }],
        },
      ],
    };
    expect(movementMeasureCount(movement)).toBe(1);
  });

  it('複数パートのうち最長のものを基準にする', () => {
    const movement: Movement = {
      id: 'm3',
      title: 'Test Round',
      timeSignature: { beats: 4, beatType: 4 },
      beatUnit: 1,
      tempoEvents: [{ atBeat: 0, bpm: 120 }],
      parts: [
        { id: 'p1', label: 'Part 1', events: [{ type: 'note', pitch: 'C4', beats: 4 }] },
        {
          id: 'p2',
          label: 'Part 2',
          events: [
            { type: 'rest', beats: 4 },
            { type: 'note', pitch: 'C4', beats: 4 },
          ],
        },
      ],
    };
    expect(movementMeasureCount(movement)).toBe(2);
  });
});

describe('effectiveQuarterBpm', () => {
  it('beatUnit=1(四分音符=1拍)ならそのまま', () => {
    expect(effectiveQuarterBpm(120, { beatUnit: 1 })).toBe(120);
  });

  it('beatUnit=1.5(付点四分=1拍)なら四分音符基準に換算', () => {
    // 付点四分=90拍/分 で指定された曲は、四分音符基準では 90*1.5=135
    expect(effectiveQuarterBpm(90, { beatUnit: 1.5 })).toBe(135);
  });

  it('tempoMultiplierを適用できる(50%スロー)', () => {
    expect(effectiveQuarterBpm(120, { beatUnit: 1 }, 0.5)).toBe(60);
  });
});

describe('toTransportBeat / toMusicBeat', () => {
  it('弱起がなければ変換は恒等写像', () => {
    expect(toTransportBeat(3, {})).toBe(3);
    expect(toMusicBeat(3, {})).toBe(3);
  });

  it('弱起がある場合、演奏開始点(弱起の先頭)が0になるようシフトする', () => {
    const movement = { pickupBeats: 1 };
    expect(toTransportBeat(-1, movement)).toBe(0); // 弱起の先頭
    expect(toTransportBeat(0, movement)).toBe(1); // 小節1の頭
    expect(toMusicBeat(0, movement)).toBe(-1);
    expect(toMusicBeat(1, movement)).toBe(0);
  });

  it('往復変換で元に戻る', () => {
    const movement = { pickupBeats: 2.5 };
    expect(toMusicBeat(toTransportBeat(7, movement), movement)).toBe(7);
  });
});

describe('tempoAtBeat', () => {
  const tempoEvents = [
    { atBeat: 0, bpm: 60 },
    { atBeat: 16, bpm: 120 },
    { atBeat: 32, bpm: 80 },
  ];

  it('区間の先頭から次の変更点未満まで同じBPMを返す', () => {
    expect(tempoAtBeat(0, tempoEvents)).toBe(60);
    expect(tempoAtBeat(15.99, tempoEvents)).toBe(60);
    expect(tempoAtBeat(16, tempoEvents)).toBe(120);
    expect(tempoAtBeat(31, tempoEvents)).toBe(120);
    expect(tempoAtBeat(32, tempoEvents)).toBe(80);
    expect(tempoAtBeat(100, tempoEvents)).toBe(80);
  });
});
