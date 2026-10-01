import { supabase } from '../lib/supabaseClient';
import type {
  EntryStatus,
  Profile,
  RepertoireEntry,
  RepertoireEntryWithStudent,
  Role,
} from './types';

/** 呼び出し側で表示できるよう、失敗はエラーメッセージ文字列で返す */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

const NOT_CONFIGURED = 'Supabaseの環境変数が未設定のため、この機能は利用できません。';

interface EntryRow {
  id: string;
  user_id: string;
  composer: string;
  title: string;
  status: EntryStatus;
  memo: string;
  lesson_date: string | null;
  created_at: string;
  updated_at: string;
}

interface EntryRowWithProfile extends EntryRow {
  profiles: { display_name: string } | null;
}

function toEntry(row: EntryRow): RepertoireEntry {
  return {
    id: row.id,
    userId: row.user_id,
    composer: row.composer,
    title: row.title,
    status: row.status,
    memo: row.memo,
    lessonDate: row.lesson_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchMyProfile(userId: string): Promise<ApiResult<Profile>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, display_name')
    .eq('id', userId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) {
    // トリガー未適用などで profiles が無い場合。マイグレーション未適用の可能性が高い。
    return {
      ok: false,
      error: 'プロフィールが見つかりません。Supabaseにマイグレーション(0002_repertoire.sql)が適用されているか確認してください。',
    };
  }
  return {
    ok: true,
    data: { id: data.id as string, role: data.role as Role, displayName: data.display_name as string },
  };
}

export async function updateDisplayName(userId: string, displayName: string): Promise<ApiResult<null>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function listMyEntries(userId: string): Promise<ApiResult<RepertoireEntry[]>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from('repertoire_entries')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data as EntryRow[]).map(toEntry) };
}

/** 講師用。RLS により講師以外は自分の行しか返らない */
export async function listAllEntries(): Promise<ApiResult<RepertoireEntryWithStudent[]>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from('repertoire_entries')
    .select('*, profiles(display_name)')
    .order('updated_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data as EntryRowWithProfile[]).map((row) => ({
      ...toEntry(row),
      studentName: row.profiles?.display_name ?? '',
    })),
  };
}

export interface EntryInput {
  composer: string;
  title: string;
  status: EntryStatus;
  memo: string;
  lessonDate: string | null;
}

function toRow(input: EntryInput) {
  return {
    composer: input.composer,
    title: input.title,
    status: input.status,
    memo: input.memo,
    lesson_date: input.lessonDate,
  };
}

export async function createEntry(userId: string, input: EntryInput): Promise<ApiResult<RepertoireEntry>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from('repertoire_entries')
    .insert({ user_id: userId, ...toRow(input) })
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: toEntry(data as EntryRow) };
}

export async function updateEntry(entryId: string, input: EntryInput): Promise<ApiResult<RepertoireEntry>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from('repertoire_entries')
    .update(toRow(input))
    .eq('id', entryId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: toEntry(data as EntryRow) };
}

export async function deleteEntry(entryId: string): Promise<ApiResult<null>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await supabase.from('repertoire_entries').delete().eq('id', entryId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}
