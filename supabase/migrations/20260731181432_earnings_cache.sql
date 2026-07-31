-- Caches Finnhub's earnings calendar (next report date + analyst estimates)
-- and earnings-surprise history (actual vs estimate per quarter) for the
-- Earnings tab. Same daily-refresh pattern as dividend_cache — Finnhub's
-- free tier is rate-limited, so this is refreshed a couple of symbols at a
-- time per request rather than all at once.
create table earnings_cache (
  symbol text primary key,
  next_date date,
  next_eps_estimate numeric,
  next_revenue_estimate numeric,
  history jsonb not null default '[]'::jsonb,
  updated_at date not null default current_date
);

alter table earnings_cache enable row level security;
