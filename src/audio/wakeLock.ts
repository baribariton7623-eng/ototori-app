/**
 * Screen Wake Lock API のラッパ。
 * 非対応環境(多くのiOS Safariバージョン等)ではAPI自体が存在しないため、
 * feature-detectして黙ってフォールバックする(spec: 「対応できない環境では制約として明記」)。
 */

export const isWakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

let sentinel: WakeLockSentinel | null = null;

export async function requestWakeLock(): Promise<void> {
  if (!isWakeLockSupported || sentinel) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch (error) {
    // 非表示タブ等、ブラウザ側の事情で拒否されることがあるが、再生自体は継続できるため無視する
    console.warn('[wakeLock] 画面スリープ抑止の取得に失敗しました', error);
  }
}

export async function releaseWakeLock(): Promise<void> {
  if (!sentinel) return;
  try {
    await sentinel.release();
  } catch {
    // 既に解放済み等は無視
  }
  sentinel = null;
}
