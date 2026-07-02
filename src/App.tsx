import { lazy, Suspense, useState } from 'react';
import Header from './components/Header';
import { useAuth } from './hooks/useAuth';
import ComposerList from './screens/ComposerList';
import MovementList from './screens/MovementList';
import WorkList from './screens/WorkList';

// Tone.js(再生画面)とSupabase-jsを使う認証パネルは重量級の依存を持つため、
// 実際に必要になるまでバンドルを取得しない(初回読み込み速度の改善)。
const PlayerScreen = lazy(() => import('./screens/PlayerScreen'));
const AuthPanel = lazy(() => import('./components/AuthPanel'));

type Screen =
  | { name: 'composers' }
  | { name: 'works'; composer: string }
  | { name: 'movements'; workId: string }
  | { name: 'player'; workId: string; movementId: string };

const SCREEN_TITLES: Record<Screen['name'], string> = {
  composers: '音取りアプリ',
  works: '作品を選択',
  movements: '楽章を選択',
  player: 'パート再生',
};

export default function App() {
  const [stack, setStack] = useState<Screen[]>([{ name: 'composers' }]);
  const [authPanelOpen, setAuthPanelOpen] = useState(false);
  const { user, isAuthEnabled } = useAuth();
  const current = stack[stack.length - 1];

  const push = (screen: Screen) => setStack((prev) => [...prev, screen]);
  const pop = () => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  const openAuthPanel = () => setAuthPanelOpen(true);

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <Header
        title={SCREEN_TITLES[current.name]}
        onBack={stack.length > 1 ? pop : undefined}
        right={
          isAuthEnabled ? (
            <button
              onClick={openAuthPanel}
              className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-accent px-4 text-sm font-medium text-paper shadow-sm transition hover:bg-accent-dark active:scale-95"
            >
              {user ? (user.email?.[0]?.toUpperCase() ?? 'U') : 'ログイン'}
            </button>
          ) : undefined
        }
      />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-2xl">
          {current.name === 'composers' && (
            <ComposerList onSelectComposer={(composer) => push({ name: 'works', composer })} />
          )}
          {current.name === 'works' && (
            <WorkList
              composer={current.composer}
              onSelectWork={(workId) => push({ name: 'movements', workId })}
              onRequireLogin={openAuthPanel}
            />
          )}
          {current.name === 'movements' && (
            <MovementList
              workId={current.workId}
              onSelectMovement={(movementId) =>
                push({ name: 'player', workId: current.workId, movementId })
              }
            />
          )}
          {current.name === 'player' && (
            <Suspense fallback={<ScreenLoadingFallback />}>
              <PlayerScreen workId={current.workId} movementId={current.movementId} />
            </Suspense>
          )}
        </div>
      </main>
      {authPanelOpen && (
        <Suspense fallback={null}>
          <AuthPanel onClose={() => setAuthPanelOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}

function ScreenLoadingFallback() {
  return (
    <div className="flex justify-center p-10">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-hairline border-t-accent" />
    </div>
  );
}
