import { useState } from 'react';
import { api } from '../api/client';
import type { Host } from '../api/types';
import { ErrorBanner, Notice } from '../components/ui';

/** 生徒アカウントを主催者として登録する */
export function BecomeHostScreen({ onRegistered }: { onRegistered: (h: Host) => void }) {
  const [displayName, setDisplayName] = useState('');
  const [lessonMinutes, setLessonMinutes] = useState(60);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="card space-y-3 max-w-md mx-auto"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          onRegistered(await api.registerHost({ displayName: displayName.trim(), lessonMinutes }));
        } catch (err) {
          setError(err);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-semibold">主催者(講師)として登録</h2>
      <Notice tone="warn">このアカウントを講師用にします。登録後は生徒として予約する操作はできません。</Notice>
      <div>
        <label className="label" htmlFor="bh-name">表示名(生徒に見える名前)</label>
        <input id="bh-name" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="bh-len">レッスン長(分)</label>
        <input id="bh-len" className="input" type="number" min={5} step={5} value={lessonMinutes} onChange={(e) => setLessonMinutes(Number(e.target.value))} />
      </div>
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <button type="submit" className="btn-primary w-full" disabled={busy}>登録する</button>
    </form>
  );
}
