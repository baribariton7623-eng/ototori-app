-- 同じ講師の確定予約は、時間帯が重ならないことを DB で保証する。
-- 0001 の一意インデックスは開始時刻の一致しか防げず、重なる営業時間枠(例: 10:00-12:00 と 10:30-12:30)で
-- 10:00 と 10:30 の予約が同時に入ると両方成立していた。
-- 既存データに重なりがあると失敗するので、適用前に次で確認する:
--   select a.id, b.id from lb_bookings a join lb_bookings b on a.host_id = b.host_id and a.id < b.id
--   where a.status = 'confirmed' and b.status = 'confirmed'
--     and tstzrange(a.start_at, a.end_at) && tstzrange(b.start_at, b.end_at);
create extension if not exists btree_gist;

alter table lb_bookings
  add constraint lb_bookings_no_overlap
  exclude using gist (host_id with =, tstzrange(start_at, end_at) with &&)
  where (status = 'confirmed');
