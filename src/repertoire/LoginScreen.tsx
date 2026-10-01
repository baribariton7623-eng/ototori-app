import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

/** ログイン後に戻ってくるURL(音取りアプリ本体ではなくこのページへ戻す) */
function redirectUrl(): string {
  return `${window.location.origin}/repertoire.html`;
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleMagicLink = async () => {
    if (!supabase || !email) return;
    setStatus('sending');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl() },
    });
    if (error) {
      setErrorMessage(error.message);
      setStatus('error');
    } else {
      setStatus('sent');
    }
  };

  const handleGoogleLogin = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl() },
    });
    if (error) {
      setErrorMessage(error.message);
      setStatus('error');
    }
  };

  return (
    <div className="mx-auto w-full max-w-sm space-y-4 rounded-3xl border border-hairline bg-card p-6 shadow-sm">
      <h2 className="text-xl font-bold tracking-tight text-ink">ログイン</h2>
      <p className="text-sm text-ink-soft">
        レパートリーの登録・閲覧にはログインが必要です。初めての方もそのままログインすると生徒として登録されます。
      </p>

      {status === 'sent' ? (
        <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-dark">
          {email} 宛にログイン用リンクを送信しました。メールをご確認ください。
        </p>
      ) : (
        <>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="h-12 w-full rounded-xl border border-hairline bg-paper px-4 text-base text-ink outline-none placeholder:text-ink-faint focus:border-accent"
          />
          <button
            onClick={handleMagicLink}
            disabled={!email || status === 'sending'}
            className="h-12 w-full rounded-full bg-accent text-base font-semibold text-paper transition hover:bg-accent-dark active:scale-95 disabled:opacity-40"
          >
            {status === 'sending' ? '送信中...' : 'マジックリンクを送る'}
          </button>
          {status === 'error' && <p className="text-sm text-red-700">{errorMessage}</p>}
        </>
      )}

      <div className="flex items-center gap-3 text-xs text-ink-faint">
        <div className="h-px flex-1 bg-hairline" />
        または
        <div className="h-px flex-1 bg-hairline" />
      </div>

      <button
        onClick={handleGoogleLogin}
        className="h-12 w-full rounded-full border border-hairline bg-paper text-base font-medium text-ink transition hover:bg-paper-soft active:scale-95"
      >
        Googleでログイン
      </button>
    </div>
  );
}
