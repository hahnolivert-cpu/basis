-- Brex reports Treasury yield with raw type DIVIDEND (it's technically a
-- money-market fund), which the sync previously carried straight through as
-- our own 'dividend' type. Economically it's the same cash-sweep yield IBKR
-- and Robinhood report as interest, so reclassify existing rows to match the
-- lib/brex.ts sync fix.
update transactions
  set type = 'interest'
  where type = 'dividend'
    and account_id in (select id from accounts where institution = 'Brex');
