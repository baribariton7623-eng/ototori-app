import { useState } from 'react';
import AuthPanel from './components/AuthPanel';
import Header from './components/Header';
import { useAuth } from './hooks/useAuth';
import ComposerList from './screens/ComposerList';
import MovementList from './screens/MovementList';
import PlayerScreen from './screens/PlayerScreen';
import WorkList from './screens/WorkList';

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
    <div className="flex min-h-screen flex-col bg-gray-950 text-gray-100">
      <Header
        title={SCREEN_TITLES[current.name]}
        onBack={stack.length > 1 ? pop : undefined}
        right={
          isAuthEnabled ? (
            <button
              onClick={openAuthPanel}
              className="shrink-0 rounded-full bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-700"
            >
              {user ? (user.email?.[0]?.toUpperCase() ?? 'U') : 'ログイン'}
            </button>
          ) : undefined
        }
      />
      <main className="flex-1">
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
          <PlayerScreen workId={current.workId} movementId={current.movementId} />
        )}
      </main>
      {authPanelOpen && <AuthPanel onClose={() => setAuthPanelOpen(false)} />}
    </div>
  );
}
