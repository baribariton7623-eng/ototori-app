import { supabase } from './supabaseClient';

export async function listFavoriteWorkIds(userId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('favorites').select('work_id').eq('user_id', userId);
  if (error) {
    console.error('[favorites] 取得に失敗しました', error);
    return [];
  }
  return data.map((row) => row.work_id as string);
}

/** 成功したかどうかを返す。呼び出し側はfalse時にオプティミスティック更新をロールバックすること */
export async function addFavorite(userId: string, workId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('favorites').insert({ user_id: userId, work_id: workId });
  if (error) {
    console.error('[favorites] 追加に失敗しました', error);
    return false;
  }
  return true;
}

/** 成功したかどうかを返す。呼び出し側はfalse時にオプティミスティック更新をロールバックすること */
export async function removeFavorite(userId: string, workId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('work_id', workId);
  if (error) {
    console.error('[favorites] 削除に失敗しました', error);
    return false;
  }
  return true;
}
