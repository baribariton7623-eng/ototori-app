import { useState } from 'react';
import { api } from '../api/client';
import type { Host } from '../api/types';
import { ErrorBanner, Notice } from '../components/ui';

/** 生徒アカウントを主催者として登録する */
export function BecomeHostScreen({ onRegistered }: { onRegistered: (h: Host) => void }) {
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [bio, setBio] = useState('');
  const [lessonMinutes, setLessonMinutes] = useState(60);
  const [agreed, setAgreed] = useState(false);
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
          onRegistered(await api.registerHost({ displayName: displayName.trim(), slug: slug.trim() || undefined, bio: bio.trim() || undefined, lessonMinutes }));
        } catch (err) {
          setError(err);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-semibold">主催者(講師)として登録</h2>
      <Notice tone="warn">このアカウントを講師用にします。登録後は生徒として予約する操作はできません。登録すると専用の予約ページ URL が発行されます(フリープラン)。</Notice>
      <div>
        <label className="label" htmlFor="bh-name">表示名(生徒に見える名前)</label>
        <input id="bh-name" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="bh-slug">URL 名(任意。英小文字・数字・ハイフン 3〜32文字。空欄なら自動生成)</label>
        <input id="bh-slug" className="input font-mono" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} pattern="[a-z0-9\-]{3,32}" placeholder="例: piano-suzuki" />
      </div>
      <div>
        <label className="label" htmlFor="bh-bio">紹介文(任意)</label>
        <textarea id="bh-bio" className="input min-h-20" value={bio} onChange={(e) => setBio(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="bh-len">レッスン長(分)</label>
        <input id="bh-len" className="input" type="number" min={5} step={5} value={lessonMinutes} onChange={(e) => setLessonMinutes(Number(e.target.value))} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>
          <a className="underline" href="/terms" target="_blank" rel="noreferrer">利用規約</a>と
          <a className="underline" href="/privacy" target="_blank" rel="noreferrer">プライバシーポリシー</a>に同意します
        </span>
      </label>
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <button type="submit" className="btn-primary w-full" disabled={busy || !agreed}>登録する</button>
    </form>
  );
}
