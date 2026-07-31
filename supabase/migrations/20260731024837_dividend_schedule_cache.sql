-- Caches the raw per-payment dividend records from Polygon (ex-dividend
-- date + per-share cash amount), not just the rolled-up yield_pct that
-- dividend_cache already stores. The expected-dividend calendar needs real
-- payment dates and amounts to time and size each month correctly — our own
-- sync history is too short/sparse for that, but this comes from the same
-- Polygon dividends call /api/dividends already makes for the yield figure,
-- so populating it costs no extra API requests.
create table dividend_schedule_cache (
  symbol text not null,
  ex_dividend_date date not null,
  cash_amount numeric not null,
  frequency int,
  updated_at date not null default current_date,
  primary key (symbol, ex_dividend_date)
);

alter table dividend_schedule_cache enable row level security;
