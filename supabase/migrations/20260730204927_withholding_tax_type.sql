-- IBKR reports dividend withholding tax as its own cash-transaction line
-- ("Withholding Tax"), distinct from the dividend it applies to. It was
-- previously swept into the generic 'transfer' bucket along with real
-- transfers, fees, and deposits — indistinguishable from unrelated cash
-- movement. Split it into its own type so the Dividends tab can show gross
-- income and tax withheld separately.
alter table transactions drop constraint transactions_type_check;
alter table transactions add constraint transactions_type_check
  check (type in ('buy', 'sell', 'dividend', 'interest', 'withholding_tax', 'transfer'));

-- Backfill: IBKR's Flex statement always sets description exactly to
-- "Withholding Tax" for this category (verified against the live account —
-- only 4 such rows exist, all IBKR). Plaid/Robinhood dividends are reported
-- net of withholding with no separate line, so this only ever applies to
-- IBKR-sourced rows.
update transactions
  set type = 'withholding_tax'
  where type = 'transfer' and description = 'Withholding Tax';
