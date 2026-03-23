-- Fix: insurer_access_logs → certificates FK に ON DELETE CASCADE を確実に付与
-- エラー: certificates 行削除時に insurer_access_logs から参照されて失敗する問題を修正

do $$
declare
  _con record;
begin
  -- certificate_id を参照する既存の FK 制約をすべて削除
  for _con in
    select conname
      from pg_constraint
     where conrelid  = 'insurer_access_logs'::regclass
       and confrelid = 'certificates'::regclass
       and contype   = 'f'
  loop
    execute format(
      'alter table insurer_access_logs drop constraint %I',
      _con.conname
    );
    raise notice 'Dropped FK constraint: %', _con.conname;
  end loop;

  -- ON DELETE CASCADE 付きで再作成
  alter table insurer_access_logs
    add constraint insurer_access_logs_certificate_id_fkey
    foreign key (certificate_id)
    references certificates (id)
    on delete cascade;

  raise notice 'Created FK insurer_access_logs_certificate_id_fkey with ON DELETE CASCADE';
end $$;
