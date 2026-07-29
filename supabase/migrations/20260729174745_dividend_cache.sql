-- Daily cache of Polygon-derived trailing dividend yield per symbol, so
-- app/api/dividends doesn't re-hit Polygon on every request.

create table dividend_cache (
  symbol text primary key,
  yield_pct numeric not null,
  updated_at date not null default current_date
);

alter table dividend_cache enable row level security;
