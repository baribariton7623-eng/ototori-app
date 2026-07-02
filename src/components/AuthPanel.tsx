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
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-lg bg-gray-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {!isAuthEnabled ? (
          <p className="text-sm text-gray-300">
            ログイン機能は現在利用できません(Supabaseの設定が未完了です)。曲選択・再生などのコア機能はそのままご利用いただけます。
          </p>
        ) : user ? (
          <>
            <p className="text-sm text-gray-300">{user.email} でログイン中</p>
            <button
              onClick={handleSignOut}
              className="w-full rounded bg-gray-800 py-2 text-sm hover:bg-gray-700"
            >
              ログアウト
            </button>
            {status === 'error' && <p className="text-sm text-red-400">{errorMessage}</p>}
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold">ログイン(任意)</h2>
            <p className="text-sm text-gray-400">
              お気に入り・ミュート設定・練習履歴を保存したい場合のみログインしてください。ログインなしでも再生機能はすべて使えます。
            </p>

            {status === 'sent' ? (
              <p className="text-sm text-green-400">
                {email} 宛にログイン用リンクを送信しました。メールをご確認ください。
              </p>
            ) : (
              <>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded bg-gray-800 px-3 py-2 text-sm"
                />
                <button
                  onClick={handleMagicLink}
                  disabled={!email || status === 'sending'}
                  className="w-full rounded bg-indigo-600 py-2 text-sm hover:bg-indigo-500 disabled:opacity-50"
                >
                  {status === 'sending' ? '送信中...' : 'マジックリンクを送る'}
                </button>
                {status === 'error' && <p className="text-sm text-red-400">{errorMessage}</p>}
              </>
            )}

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="h-px flex-1 bg-gray-800" />
              または
              <div className="h-px flex-1 bg-gray-800" />
            </div>

            <button
              onClick={handleGoogleLogin}
              className="w-full rounded bg-gray-800 py-2 text-sm hover:bg-gray-700"
            >
              Googleでログイン
            </button>
          </>
        )}

        <button
          onClick={onClose}
          className="w-full rounded py-2 text-sm text-gray-400 hover:text-gray-200"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
