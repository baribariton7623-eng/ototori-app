import { useState } from 'react';
import { AUTH_MODE, setDevUser, signInWithGoogle } from '../api/auth';
import { ErrorBanner, Notice } from '../components/ui';

export function LoginScreen({ onLogin, embedded = false }: { onLogin: () => void; embedded?: boolean }) {
  const wrap = embedded ? 'space-y-4' : 'card max-w-sm mx-auto mt-10 space-y-4';
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<unknown>(null);

  if (AUTH_MODE === 'supabase') {
    return (
      <div className={`${wrap} text-center`}>
        {!embedded && <h1 className="text-lg font-semibold">レッスン予約</h1>}
        <p className="text-sm text-stone-600">Google アカウントでログインして予約を管理します。</p>
        <button
          type="button"
          className="btn-primary w-full"
          onClick={() => signInWithGoogle().catch(setError)}
        >
          Google でログイン
        </button>
        <ErrorBanner error={error} />
        <p className="text-xs text-stone-500">ログインすると<a className="underline" href="/terms" target="_blank" rel="noreferrer">利用規約</a>と<a className="underline" href="/privacy" target="_blank" rel="noreferrer">プライバシーポリシー</a>に同意したものとみなします。</p>
      </div>
    );
  }

  return (
    <form
      className={wrap}
      onSubmit={(e) => {
        e.preventDefault();
        if (!email.includes('@')) {
          setError(new Error('メールアドレスを入力してください'));
          return;
        }
        setDevUser({ email: email.trim().toLowerCase(), name: name.trim() });
        onLogin();
      }}
    >
      {!embedded && <h1 className="text-lg font-semibold">レッスン予約</h1>}
      <Notice tone="warn">開発モード: メールアドレスを入力するとそのユーザーとして操作できます(本番では Google ログインになります)。</Notice>
      <div>
        <label className="label" htmlFor="login-email">メールアドレス</label>
        <input id="login-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
      </div>
      <div>
        <label className="label" htmlFor="login-name">表示名(任意)</label>
        <input id="login-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="山田 花子" />
      </div>
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <button type="submit" className="btn-primary w-full">ログイン</button>
      <p className="text-xs text-stone-500">ログインすると<a className="underline" href="/terms" target="_blank" rel="noreferrer">利用規約</a>と<a className="underline" href="/privacy" target="_blank" rel="noreferrer">プライバシーポリシー</a>に同意したものとみなします。</p>
    </form>
  );
}
