-- マイグレーション後: Supabase の既定と同様に各ロールへ public スキーマの権限を与える。
-- anon / authenticated は RLS(ポリシーなし)で全行拒否され、service_role は RLS をバイパスする
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
