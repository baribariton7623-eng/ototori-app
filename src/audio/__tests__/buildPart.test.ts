import { describe, expect, it } from 'vitest';
import { buildPartEvents } from '../buildPart';
import type { Part } from '../../types/music';

// buildPartEvents は Tone.js のオーディオノードを生成しない純粋関数なので
// Web Audio APIが無いNode環境でもテストできる。createTonePart/PlaybackEngine
// 本体(実際にTone.Part/PolySynthを生成する部分)はブラウザでの手動確認に委ねる。

describe('buildPartEvents', () => {
  it('休符を挟みつつ、各イベントの開始tickと長さtickを直列に計算する(PPQ=192)', () => {
    const part: Part = {
      id: 'p1',
      label: 'Part 1',
      events: [
        { type: 'note', pitch: 'C4', beats: 1 },
        { type: 'rest', beats: 0.5 },
        { type: 'note', pitch: 'D4', beats: 1.5 },
      ],
    };
    const events = buildPartEvents(part, 192);
    expect(events).toEqual([
      ['0i', { kind: 'note', pitch: 'C4', durationTicks: 192 }],
      ['192i', { kind: 'rest', durationTicks: 96 }],
      ['288i', { kind: 'note', pitch: 'D4', durationTicks: 288 }],
    ]);
  });

  it('カーソルは常に0から開始する(弱起の解決は呼び出し側の責務)', () => {
    const part: Part = {
      id: 'p1',
      label: 'Part 1',
      events: [{ type: 'note', pitch: 'G4', beats: 1 }],
    };
    const [[time]] = buildPartEvents(part, 192);
    expect(time).toBe('0i');
  });

  it('三連八分(1/3拍)がPPQ=192で整数tickになる', () => {
    const part: Part = {
      id: 'p1',
      label: 'Part 1',
      events: [
        { type: 'note', pitch: 'C4', beats: 1 / 3 },
        { type: 'note', pitch: 'D4', beats: 1 / 3 },
      ],
    };
    const events = buildPartEvents(part, 192);
    expect(events[0][1].durationTicks).toBe(64);
    expect(events[1][0]).toBe('64i');
  });
});
