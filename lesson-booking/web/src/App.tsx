import { useCallback, useEffect, useState } from 'react';
import { isSignedIn, onAuthChange, signOut } from './api/auth';
import { ApiError, api } from './api/client';
import type { Host, Me, Rules } from './api/types';
import { ErrorBanner, Spinner } from './components/ui';
import { BecomeHostScreen } from './screens/BecomeHostScreen';
import { BookScreen } from './screens/BookScreen';
import { HostScreen } from './screens/HostScreen';
import { LoginScreen } from './screens/LoginScreen';
import { MyBookingsScreen } from './screens/MyBookingsScreen';

type Route = 'book' | 'mine' | 'host' | 'become-host';

function readRoute(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  if (h === 'mine' || h === 'host' || h === 'become-host') return h;
  return 'book';
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [bookingsKey, setBookingsKey] = useState(0);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const ok = await isSignedIn();
      setSignedIn(ok);
      if (ok) setMe(await api.me());
      else setMe(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setSignedIn(false);
        setMe(null);
      } else setError(e);
    }
  }, []);

  useEffect(() => {
    api.rules().then(setRules).catch(setError);
    void refreshSession();
    return onAuthChange(() => void refreshSession());
  }, [refreshSession]);

  function go(r: Route) {
    window.location.hash = `/${r}`;
  }

  function onHostUpdated(h: Host) {
    setMe((m) => (m ? { ...m, host: h, role: 'host' } : m));
  }

  if (signedIn === null || rules === null) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <ErrorBanner error={error} />
        {!error && <Spinner />}
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="p-4">
        <LoginScreen onLogin={() => void refreshSession()} />
      </div>
    );
  }

  const isHost = me?.role === 'host' && me.host;
  // 主催者は主催者画面、生徒は予約画面が既定
  const effective: Route = isHost ? 'host' : route === 'host' ? 'become-host' : route;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-stone-200">
        <div className="max-w-3xl mx-auto px-4 py-2 flex items-center justify-between gap-2">
          <div className="font-semibold whitespace-nowrap">レッスン予約{isHost && <span className="ml-2 text-xs font-normal text-stone-500">主催者: {me?.host?.displayName}</span>}</div>
          <nav className="flex items-center gap-0.5 text-xs sm:text-sm">
            {!isHost && (
              <>
                <NavButton active={effective === 'book'} onClick={() => go('book')}>予約する</NavButton>
                <NavButton active={effective === 'mine'} onClick={() => go('mine')}>マイ予約</NavButton>
                <NavButton active={effective === 'become-host'} onClick={() => go('become-host')}>講師の方</NavButton>
              </>
            )}
            <button
              type="button"
              className="ml-1 whitespace-nowrap text-xs text-stone-500 underline"
              onClick={() => signOut().then(() => refreshSession())}
              title={me?.email}
            >
              ログアウト
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <ErrorBanner error={error} onClose={() => setError(null)} />
        {effective === 'book' && <BookScreen rules={rules} onBooked={() => setBookingsKey((k) => k + 1)} />}
        {effective === 'mine' && <MyBookingsScreen rules={rules} refreshKey={bookingsKey} />}
        {effective === 'become-host' && <BecomeHostScreen onRegistered={(h) => { onHostUpdated(h); go('host'); }} />}
        {effective === 'host' && me?.host && <HostScreen host={me.host} rules={rules} onHostUpdated={onHostUpdated} />}
      </main>
    </div>
  );
}

function NavButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className={`whitespace-nowrap rounded-md px-2 py-1 ${active ? 'bg-emerald-700 text-white' : 'text-stone-700 hover:bg-stone-100'}`}>
      {children}
    </button>
  );
}
