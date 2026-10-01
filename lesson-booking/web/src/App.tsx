import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { isSignedIn, onAuthChange, signOut } from './api/auth';
import { ApiError, api } from './api/client';
import type { Host, Me, Rules } from './api/types';
import { Footer } from './components/Footer';
import { ErrorBanner, Modal, Notice, Spinner } from './components/ui';
import { BookScreen } from './screens/BookScreen';
import { LandingScreen } from './screens/LandingScreen';
import { StudentHomeScreen } from './screens/StudentHomeScreen';

// 最初の表示(予約ページ・LP)に要らない画面は、開いたときに読み込む
const HostScreen = lazy(() => import('./screens/HostScreen').then((m) => ({ default: m.HostScreen })));
const MyBookingsScreen = lazy(() => import('./screens/MyBookingsScreen').then((m) => ({ default: m.MyBookingsScreen })));
const BecomeHostScreen = lazy(() => import('./screens/BecomeHostScreen').then((m) => ({ default: m.BecomeHostScreen })));
const OrgPageScreen = lazy(() => import('./screens/OrgPageScreen').then((m) => ({ default: m.OrgPageScreen })));
const LoginScreen = lazy(() => import('./screens/LoginScreen').then((m) => ({ default: m.LoginScreen })));
const TermsPage = lazy(() => import('./legal/LegalPages').then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import('./legal/LegalPages').then((m) => ({ default: m.PrivacyPage })));
const TokushohoPage = lazy(() => import('./legal/LegalPages').then((m) => ({ default: m.TokushohoPage })));

type Route =
  | { name: 'legal'; page: 'terms' | 'privacy' | 'tokushoho' }
  | { name: 'home' }
  | { name: 'host-page'; slug: string }
  | { name: 'org-page'; slug: string }
  | { name: 'mine' }
  | { name: 'host' }
  | { name: 'become-host' };

function readRoute(): Route {
  // 法務ページは実パス(/terms 等)。Google OAuth 審査や特商法表記の URL として使う
  const p = window.location.pathname.replace(/\/+$/, '');
  if (p === '/terms' || p === '/privacy' || p === '/tokushoho') return { name: 'legal', page: p.slice(1) as 'terms' | 'privacy' | 'tokushoho' };
  const h = window.location.hash.replace(/^#\/?/, '');
  const m = /^h\/([^/?#]+)/.exec(h);
  if (m?.[1]) return { name: 'host-page', slug: decodeURIComponent(m[1]) };
  const o = /^o\/([^/?#]+)/.exec(h);
  if (o?.[1]) return { name: 'org-page', slug: decodeURIComponent(o[1]) };
  if (h === 'mine') return { name: 'mine' };
  if (h === 'host') return { name: 'host' };
  if (h === 'become-host') return { name: 'become-host' };
  return { name: 'home' };
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [bookingsKey, setBookingsKey] = useState(0);
  const [showLogin, setShowLogin] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const ok = await isSignedIn();
      setSignedIn(ok);
      setMe(ok ? await api.me() : null);
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

  const go = (hash: string) => {
    if (window.location.pathname !== '/') {
      window.location.href = `/#${hash}`;
      return;
    }
    window.location.hash = hash;
  };
  const onDeleted = () => {
    void signOut().then(async () => {
      setFlash('退会しました。ご利用ありがとうございました。');
      go('/');
      await refreshSession();
    });
  };
  const onHostUpdated = (h: Host) => setMe((m) => (m ? { ...m, host: h, role: 'host' } : m));
  const openLogin = () => setShowLogin(true);
  const onLoggedIn = () => {
    setShowLogin(false);
    setFlash(null);
    void refreshSession();
  };

  if (signedIn === null || rules === null) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <ErrorBanner error={error} />
        {!error && <Spinner />}
      </div>
    );
  }

  const isHost = signedIn && me?.role === 'host' && !!me.host;

  // 画面の決定
  let content: React.ReactNode;
  if (route.name === 'legal') {
    content = route.page === 'terms' ? <TermsPage /> : route.page === 'privacy' ? <PrivacyPage /> : <TokushohoPage />;
  } else if (route.name === 'org-page') {
    content = <OrgPageScreen slug={route.slug} />;
  } else if (route.name === 'host-page') {
    content = (
      <BookScreen slug={route.slug} rules={rules} signedIn={signedIn} onRequireLogin={openLogin} onBooked={() => setBookingsKey((k) => k + 1)} />
    );
  } else if (!signedIn) {
    content = <LandingScreen rules={rules} onLogin={openLogin} />;
  } else if (isHost) {
    content = me?.host ? <HostScreen host={me.host} rules={rules} onHostUpdated={onHostUpdated} onDeleted={onDeleted} /> : null;
  } else if (route.name === 'mine') {
    content = <MyBookingsScreen rules={rules} refreshKey={bookingsKey} email={me?.email ?? ''} onDeleted={onDeleted} />;
  } else if (route.name === 'become-host' || route.name === 'host') {
    content = (
      <BecomeHostScreen
        onRegistered={(h) => {
          onHostUpdated(h);
          go('/host');
        }}
      />
    );
  } else {
    content = <StudentHomeScreen />;
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-stone-200">
        <div className="max-w-3xl mx-auto px-4 py-2 flex items-center justify-between gap-2">
          <a href={isHost ? '/#/host' : '/#/'} className="font-semibold whitespace-nowrap">
            レッスン予約
            {isHost && <span className="ml-2 text-xs font-normal text-stone-500">主催者: {me?.host?.displayName}</span>}
          </a>
          <nav className="flex items-center gap-0.5 text-xs sm:text-sm">
            {signedIn && !isHost && (
              <>
                <NavButton active={route.name === 'home'} onClick={() => go('/')}>ホーム</NavButton>
                <NavButton active={route.name === 'mine'} onClick={() => go('/mine')}>マイ予約</NavButton>
                <NavButton active={route.name === 'become-host'} onClick={() => go('/become-host')}>講師の方</NavButton>
              </>
            )}
            {isHost && me?.host && (
              <a className="whitespace-nowrap rounded-md px-2 py-1 text-stone-700 hover:bg-stone-100" href={`/#/h/${me.host.slug}`}>公開ページ</a>
            )}
            {signedIn ? (
              <button type="button" className="ml-1 whitespace-nowrap text-xs text-stone-500 underline" onClick={() => signOut().then(() => refreshSession())} title={me?.email}>
                ログアウト
              </button>
            ) : (
              <button type="button" className="ml-1 whitespace-nowrap text-xs text-emerald-800 underline" onClick={openLogin}>
                ログイン
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <ErrorBanner error={error} onClose={() => setError(null)} />
        {flash && (
          <Notice tone="success">
            {flash}
            <button type="button" className="ml-2 underline text-xs" onClick={() => setFlash(null)}>閉じる</button>
          </Notice>
        )}
        <Suspense fallback={<Spinner />}>{content}</Suspense>
      </main>
      <Footer />

      {showLogin && (
        <Modal title="ログイン" onClose={() => setShowLogin(false)}>
          <Suspense fallback={<Spinner />}>
            <LoginScreen onLogin={onLoggedIn} embedded />
          </Suspense>
        </Modal>
      )}
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
