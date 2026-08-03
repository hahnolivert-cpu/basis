-- Realized gain per sell transaction, so the Ask assistant's query_database
-- tool doesn't have to derive average-cost lot-matching from scratch in raw
-- SQL each time (it tried, on "how much profit did I realize on Robinhood
-- and IBKR in 2026" — six queries wasn't enough to land it, and the naive
-- approach would have been wrong anyway: IBKR records currency-pair
-- conversions as type='sell' too — see the EUR.USD / USD.CHF exclusion
-- below, all $0 amount_cents, not real sales).
--
-- Average cost, not FIFO: cost_basis_cents on `holdings` is already a
-- single blended number per (account, symbol), not tracked per lot, so
-- there's no per-lot data to do FIFO against even if we wanted to. For each
-- sell, avg_cost_cents_per_unit is total buy cash spent / total buy
-- quantity across every buy of that symbol in that account up to and
-- including the sell's date — sells don't change the average cost of
-- remaining shares, only the buys before this point matter.
--
-- realized_gain_cents is NULL (not a fabricated 0) when a sell has no
-- matching buy history at all — e.g. a position that predates when this
-- app started recording transactions — so the assistant reports "unknown"
-- rather than silently assuming a $0 cost basis and overstating the gain.
create view assistant_realized_gains as
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
  and t.symbol not in ('EUR.USD', 'USD.CHF')
  and t.qty is not null
  and t.amount_cents is not null;

alter view assistant_realized_gains owner to assistant_readonly;
grant select on assistant_realized_gains to assistant_readonly;
