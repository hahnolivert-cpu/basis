-- Weekly net-worth history, one row per Sunday. Seeded from the spreadsheet
-- export (source='import') and continued by the Sunday cron (source='auto').
--
-- usd_to_eur is EUR per USD (~0.85), matching the source spreadsheet's
-- convention — NOT the EURUSD quote convention (USD per EUR, ~1.18). To show
-- a EUR total: total_cents * usd_to_eur.
--
-- total_cents is stored as given rather than recomputed from the three
-- buckets; the spreadsheet has sub-dollar rounding drift in a couple of rows
-- and the recorded total is the figure of record.

create table weekly_snapshots (
  sunday_date date primary key,
  crypto_cents bigint not null,
  equities_cents bigint not null,
  cash_cents bigint not null,
  total_cents bigint not null,
  usd_to_eur numeric not null,
  btc_price_usd numeric not null,
  source text not null check (source in ('import', 'auto')),
  created_at timestamptz not null default now()
);

alter table weekly_snapshots enable row level security;
