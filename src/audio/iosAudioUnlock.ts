/**
 * iOS Safariは、Web Audio API(Tone.js)だけで鳴らした音を「サイレントスイッチ」
 * (端末側面のマナーモード切り替え)がオンの間はミュートしてしまう。
 * 対策を2段構えで行う:
 *
 * 1. Audio Session API(iOS 16.4+ / Safari 16.4+): navigator.audioSession.type を
 *    'playback' に設定すると、Web Audioがサイレントスイッチの影響を受けなくなる(公式の解決策)。
 * 2. 旧iOS向けフォールバック: 無音の<audio>要素をループ再生して"playback"
 *    オーディオセッションを確立する既知の回避策。
 *
 * StartAudioOverlayのタップ(ユーザー操作)内で一度だけ呼び出す想定。
 */

interface AudioSessionLike {
  type: string;
}

let unlocked = false;
// GCで回収されると再生が止まり効果が消えるため、モジュールスコープで参照を保持し続ける
let silentAudio: HTMLAudioElement | null = null;

function setPlaybackAudioSession(): void {
  const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
  if (session) {
    session.type = 'playback';
  }
}

function createSilentWavUrl(): string {
  const sampleRate = 8000;
  const numSamples = sampleRate; // 1秒の無音(短すぎるループはブラウザ実装で不安定になりうる)
  const dataSize = numSamples * 2; // 16-bit mono
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  // データ部分は書き込まない(ArrayBufferは0初期化されているため無音のまま)
  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

export function unlockIosAudioPlaybackSession(): void {
  if (unlocked || typeof Audio === 'undefined') return;
  unlocked = true;

  setPlaybackAudioSession();

  try {
    silentAudio = new Audio(createSilentWavUrl());
    silentAudio.loop = true;
    // ユーザー操作の同期的な流れの中で呼ぶことが重要(非同期待機を挟まない)
    void silentAudio.play().catch(() => {
      // 再生が拒否されても、Audio Session API側が効いていれば問題ない
    });
  } catch {
    // Audio自体が使えない環境では何もしない
  }
}
