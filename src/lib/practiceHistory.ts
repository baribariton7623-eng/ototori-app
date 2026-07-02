import { supabase } from './supabaseClient';

/** 楽章を開いて実際に再生を開始したタイミングで呼ぶ。play_countを加算するupsert */
export async function recordPractice(userId: string, workId: string, movementId: string): Promise<void> {
  if (!supabase) return;

  const { data: existing, error: selectError } = await supabase
    .from('practice_history')
    .select('play_count')
    .eq('user_id', userId)
    .eq('work_id', workId)
    .eq('movement_id', movementId)
    .maybeSingle();
  if (selectError) {
    console.error('[practiceHistory] 取得に失敗しました', selectError);
    return;
  }

  const now = new Date().toISOString();
  if (existing) {
    const { error } = await supabase
      .from('practice_history')
      .update({ play_count: existing.play_count + 1, last_played_at: now })
      .eq('user_id', userId)
      .eq('work_id', workId)
      .eq('movement_id', movementId);
    if (error) console.error('[practiceHistory] 更新に失敗しました', error);
  } else {
    const { error } = await supabase.from('practice_history').insert({
      user_id: userId,
      work_id: workId,
      movement_id: movementId,
      play_count: 1,
      first_played_at: now,
      last_played_at: now,
    });
    if (error) console.error('[practiceHistory] 追加に失敗しました', error);
  }
}
