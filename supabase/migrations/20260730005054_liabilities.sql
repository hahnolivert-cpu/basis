-- Debts, so net worth stops depending on a hardcoded constant.
--
-- DEBTS = 24271 lived in lib/data.ts and never changed as balances moved. That
-- figure came from the original screenshots, so it is carried over here as a
-- starting row rather than dropped — zeroing it would have overstated net worth
-- by $24,271, which is the opposite error.

create table liabilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  updated_at timestamptz not null default now()
);

alter table liabilities enable row level security;

insert into liabilities (name, amount_cents) values ('Debts (imported — please verify)', 2427100);
