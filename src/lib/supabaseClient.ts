import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * 環境変数が未設定の場合は null になる。
 * 呼び出し側(favorites/muteSettings/practiceHistory等)は必ず
 * `if (!supabase) return` で早期リターンし、ログイン・保存機能が
 * 無効化されてもコア機能(曲選択・再生)には一切影響しないことを保証する。
 */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

if (!supabase) {
  console.warn(
    '[supabase] 環境変数(VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY)が未設定のため、' +
      'ログイン・お気に入り・練習履歴の保存機能は無効化されます。曲選択・再生などのコア機能には影響ありません。',
  );
}
