/**
 * iOS Safariは、Web Audio API(Tone.js)だけで鳴らした音を「サイレントスイッチ」
 * (端末側面のマナーモード切り替え)がオンの間はミュートしてしまうことがある。
 * これは <audio>/<video> 要素の再生("playback"オーディオセッション)を伴わない
 * 場合に起きる既知の挙動で、無音の<audio>要素を再生しておくことで
 * "playback"セッションを有効化し、Web Audio側の音もサイレントスイッチの
 * 影響を受けなくなる。
 *
 * StartAudioOverlayのタップ(ユーザー操作)内で一度だけ呼び出す想定。
 */

let unlocked = false;

function createSilentLoopUrl(): string {
  const sampleRate = 8000;
  const numSamples = 1;
  const dataSize = numSamples * 2; // 16-bit mono, 1サンプル=無音
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
  try {
    const audio = new Audio(createSilentLoopUrl());
    audio.loop = true;
    audio.volume = 0;
    // ユーザー操作の同期的な流れの中で呼ぶことが重要(非同期待機を挟まない)
    void audio.play().catch(() => {
      // 対応していない/失敗しても、Tone.js側の再生自体は通常経路で試みられる
    });
  } catch {
    // Audio自体が使えない環境では何もしない
  }
}
