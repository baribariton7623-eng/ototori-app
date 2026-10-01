-- レパートリー管理: 講師にも全生徒の登録曲の追加・編集・削除を許可する
--
-- 0002 では講師は閲覧のみだった。生徒の権限(自分の行の CRUD)は変更しない。
-- 更新者の記録は持たない方針のため、同時編集は後から保存した内容で上書きされる。

create policy "teacher entries insert" on public.repertoire_entries
  for insert with check (public.is_teacher());
create policy "teacher entries update" on public.repertoire_entries
  for update using (public.is_teacher()) with check (public.is_teacher());
create policy "teacher entries delete" on public.repertoire_entries
  for delete using (public.is_teacher());
