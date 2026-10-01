import { useCallback, useEffect, useState } from 'react';
import Header from '../components/Header';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import { fetchMyProfile } from './api';
import LoginScreen from './LoginScreen';
import StudentScreen from './StudentScreen';
import TeacherScreen from './TeacherScreen';
import type { Profile } from './types';

/**
 * レパートリー管理アプリ(repertoire.html)のルート。
 * 音取りアプリ本体(index.html)とは別エントリだが、Supabaseのセッションは同一オリジンで共有される。
 * ログインは必須で、profiles.role により生徒画面/講師画面を出し分ける。
 */
export default function RepertoireApp() {
  const { user, loading: authLoading, isAuthEnabled } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const loadProfile = useCallback(async (userId: string) => {
    setProfileLoading(true);
    setProfileError(null);
    const result = await fetchMyProfile(userId);
    if (result.ok) setProfile(result.data);
    else setProfileError(result.error);
    setProfileLoading(false);
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    void loadProfile(user.id);
  }, [user, loadProfile]);

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  const headerRight = user ? (
    <button
      onClick={handleSignOut}
      className="flex h-11 shrink-0 items-center justify-center rounded-full border border-hairline px-4 text-sm font-medium text-ink-soft transition hover:bg-paper-soft active:scale-95"
    >
      ログアウト
    </button>
  ) : undefined;

  let body: React.ReactNode;
  if (!isAuthEnabled) {
    body = (
      <Notice>
        ログイン機能が利用できません(Supabaseの環境変数 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が未設定です)。
      </Notice>
    );
  } else if (authLoading || (user && profileLoading)) {
    body = <Notice>読み込み中...</Notice>;
  } else if (!user) {
    body = <LoginScreen />;
  } else if (profileError) {
    body = (
      <Notice tone="error">
        <p>{profileError}</p>
        <button
          onClick={() => loadProfile(user.id)}
          className="mt-3 h-11 rounded-full bg-accent px-5 text-sm font-semibold text-paper transition hover:bg-accent-dark active:scale-95"
        >
          再読み込み
        </button>
      </Notice>
    );
  } else if (profile?.role === 'teacher') {
    body = <TeacherScreen profile={profile} />;
  } else if (profile) {
    body = <StudentScreen profile={profile} onProfileChange={setProfile} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <Header
        title={profile?.role === 'teacher' ? 'レパートリー一覧(講師)' : 'レパートリー管理'}
        right={headerRight}
      />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{body}</main>
    </div>
  );
}

function Notice({ children, tone = 'normal' }: { children: React.ReactNode; tone?: 'normal' | 'error' }) {
  return (
    <div
      className={
        tone === 'error'
          ? 'rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800'
          : 'rounded-2xl border border-hairline bg-card p-5 text-base text-ink-soft'
      }
    >
      {children}
    </div>
  );
}
