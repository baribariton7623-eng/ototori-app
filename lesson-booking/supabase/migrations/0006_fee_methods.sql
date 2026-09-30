-- キャンセルフィーの支払い方法(クレジットカード / 銀行振込 / 次回手渡し)

alter table lb_hosts
  add column if not exists fee_methods text[] not null default array['bank_transfer', 'in_person', 'card']::text[],
  add column if not exists bank_transfer_info text not null default '';
alter table lb_hosts add constraint lb_hosts_fee_methods_valid
  check (fee_methods <@ array['card', 'bank_transfer', 'in_person']::text[]);

alter table lb_bookings
  add column if not exists cancellation_fee_method text
    check (cancellation_fee_method is null or cancellation_fee_method in ('card', 'bank_transfer', 'in_person'));

alter table lb_change_requests
  add column if not exists fee_method text
    check (fee_method is null or fee_method in ('card', 'bank_transfer', 'in_person'));
