import { supabase } from './supabaseClient';

export interface PartMuteSetting {
  muted: boolean;
  volume: number;
}

export type PartMuteSettings = Record<string, PartMuteSetting>;

export async function loadMuteSettings(
  userId: string,
  workId: string,
  movementId: string,
): Promise<PartMuteSettings | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('part_mute_settings')
    .select('settings')
    .eq('user_id', userId)
    .eq('work_id', workId)
    .eq('movement_id', movementId)
    .maybeSingle();
  if (error) {
    console.error('[muteSettings] 取得に失敗しました', error);
    return null;
  }
  return (data?.settings as PartMuteSettings | undefined) ?? null;
}

export async function saveMuteSettings(
  userId: string,
  workId: string,
  movementId: string,
  settings: PartMuteSettings,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('part_mute_settings').upsert(
    {
      user_id: userId,
      work_id: workId,
      movement_id: movementId,
      settings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,work_id,movement_id' },
  );
  if (error) console.error('[muteSettings] 保存に失敗しました', error);
}
