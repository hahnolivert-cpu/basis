-- Replace the hardcoded EUR.USD/USD.CHF exclusion with a shape-based one
-- (three letters, dot, three letters), matching the equivalent fix just
-- made to the app's own realizedGains() in app/api/transactions/route.ts —
-- a hardcoded list silently misses the next currency pair IBKR logs as a
-- buy/sell. Column list is unchanged, so CREATE OR REPLACE is safe here.
create or replace view assistant_realized_gains as
select
  t.id,
  t.account_id,
  a.institution,
  a.name as account_name,
  a.portfolio,
  t.symbol,
  t.date as sell_date,
  t.qty as qty_sold,
  t.amount_cents as proceeds_cents,
  b.avg_cost_cents_per_unit,
  case
    when b.avg_cost_cents_per_unit is null then null
    else round(t.amount_cents - (b.avg_cost_cents_per_unit * t.qty))
  end as realized_gain_cents
from transactions t
join accounts a on a.id = t.account_id
join lateral (
  select (-sum(buys.amount_cents))::numeric / nullif(sum(buys.qty), 0) as avg_cost_cents_per_unit
  from transactions buys
  where buys.account_id = t.account_id
    and buys.symbol = t.symbol
    and buys.type = 'buy'
    and buys.date <= t.date
) b on true
where t.type = 'sell'
  and t.symbol is not null
  and t.symbol !~ '^[A-Z]{3}\.[A-Z]{3}$'
  and t.qty is not null
  and t.amount_cents is not null;
