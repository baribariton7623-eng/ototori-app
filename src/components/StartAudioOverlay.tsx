import { useEffect, useState } from 'react';
import * as Tone from 'tone';

/**
 * iOS Safari等はユーザー操作なしに音を出せないため、画面全体を覆う
 * 「タップして開始」オーバーレイを表示し、そのタップ内で Tone.start() を呼ぶ。
 * AudioContextが既にrunning状態(=既にどこかで開始済み)ならレンダリングしない。
 */
export default function StartAudioOverlay() {
  const [ready, setReady] = useState(() => Tone.getContext().state === 'running');

  useEffect(() => {
    if (ready) return;
    const interval = setInterval(() => {
      if (Tone.getContext().state === 'running') setReady(true);
    }, 300);
    return () => clearInterval(interval);
  }, [ready]);

  if (ready) return null;

  const handleTap = async () => {
    await Tone.start();
    setReady(true);
  };

  return (
    <div
      onClick={handleTap}
      className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/80 text-center"
    >
      <p className="text-3xl">🔊</p>
      <p className="text-lg font-medium">タップして音取りを開始</p>
      <p className="max-w-xs text-sm text-gray-400">
        スマートフォンのブラウザでは、操作なしに音を鳴らすことができません。
      </p>
    </div>
  );
}
