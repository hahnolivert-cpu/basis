-- Widen the asset_class check constraint to add "Angel Investment" — a
-- distinct category for illiquid private positions (e.g. Strala) that
-- shouldn't bucket as an ordinary "Stocks" holding in the composition
-- charts. Finds and drops whatever the existing constraint is named,
-- rather than assuming Postgres's default auto-generated name, so this
-- doesn't depend on how the original column check was created.
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'holdings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%asset_class%'
  loop
    execute format('alter table holdings drop constraint %I', con.conname);
  end loop;
end $$;

alter table holdings add constraint holdings_asset_class_check
  check (asset_class in ('Cash', 'Equities', 'Crypto', 'Angel Investment'));
