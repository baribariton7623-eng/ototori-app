import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';

interface AuthPanelProps {
  onClose: () => void;
}

export default function AuthPanel({ onClose }: AuthPanelProps) {
  const { user, isAuthEnabled } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleMagicLink = async () => {
    if (!supabase || !email) return;
    setStatus('sending');
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      setErrorMessage(error.message);
      setStatus('error');
    } else {
      setStatus('sent');
    }
  };

  const handleGoogleLogin = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) {
      setErrorMessage(error.message);
      setStatus('error');
    }
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      setErrorMessage(error.message);
      setStatus('error');
      return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-3xl border border-hairline bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!isAuthEnabled ? (
          <p className="text-base text-ink-soft">
            ログイン機能は現在利用できません(Supabaseの設定が未完了です)。曲選択・再生などのコア機能はそのままご利用いただけます。
          </p>
        ) : user ? (
          <>
            <p className="text-base text-ink">{user.email} でログイン中</p>
            <button
              onClick={handleSignOut}
              className="h-12 w-full rounded-full bg-paper-soft text-base font-medium text-ink-soft transition hover:bg-hairline active:scale-95"
            >
              ログアウト
            </button>
            {status === 'error' && <p className="text-sm text-red-700">{errorMessage}</p>}
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold tracking-tight text-ink">ログイン(任意)</h2>
            <p className="text-sm text-ink-soft">
              お気に入り・ミュート設定・練習履歴を保存したい場合のみログインしてください。ログインなしでも再生機能はすべて使えます。
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
          </>
        )}

        <button
          onClick={onClose}
          className="h-11 w-full rounded-full text-sm font-medium text-ink-faint transition hover:text-ink-soft"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
