-- Core schema for Basis: accounts, holdings, daily snapshots, transactions,
-- and Plaid item credentials. Single-user app — no user_id/tenant column;
-- access is gated by RLS (enabled, no policies) so only the service role,
-- used exclusively from app/api server routes, can read or write.

create table accounts (
  id uuid primary key default gen_random_uuid(),
  institution text not null,
  name text not null,
  portfolio text not null check (portfolio in ('capital', 'personal')),
  type text not null check (type in ('cash', 'brokerage', 'crypto')),
  created_at timestamptz not null default now()
);

create table holdings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  symbol text not null,
  name text not null,
  qty numeric,
  cost_basis_cents bigint not null,
  value_cents bigint not null,
  asset_class text not null check (asset_class in ('Cash', 'Equities', 'Crypto')),
  sector text,
  geo text,
  yield_pct numeric not null default 0,
  is_manual boolean not null default true,
  updated_at timestamptz not null default now()
);
create index holdings_account_id_idx on holdings (account_id);

create table snapshots (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  account_id uuid not null references accounts (id) on delete cascade,
  value_cents bigint not null,
  eurusd_rate numeric,
  btcusd_rate numeric,
  unique (date, account_id)
);
create index snapshots_account_id_idx on snapshots (account_id);
create index snapshots_date_idx on snapshots (date);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  date date not null,
  type text not null check (type in ('buy', 'sell', 'dividend', 'interest', 'transfer')),
  symbol text,
  amount_cents bigint not null
);
create index transactions_account_id_idx on transactions (account_id);
create index transactions_date_idx on transactions (date);

create table plaid_items (
  id uuid primary key default gen_random_uuid(),
  institution text not null,
  access_token text not null,
  cursor text,
  created_at timestamptz not null default now()
);

alter table accounts enable row level security;
alter table holdings enable row level security;
alter table snapshots enable row level security;
alter table transactions enable row level security;
alter table plaid_items enable row level security;
