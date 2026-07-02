import { useEffect } from 'react';
import { isWakeLockSupported, releaseWakeLock, requestWakeLock } from '../audio/wakeLock';

/**
 * isActive の間、画面スリープを抑止する。
 * Wake Lockはタブが非表示になると自動解除されるため、再度可視化された時に
 * 再取得する(Screen Wake Lock APIの既知の挙動)。
 */
export function useWakeLock(isActive: boolean): { isSupported: boolean } {
  useEffect(() => {
    if (!isActive) {
      releaseWakeLock();
      return;
    }

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [isActive]);

  return { isSupported: isWakeLockSupported };
}
