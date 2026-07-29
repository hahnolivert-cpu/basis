-- Human-readable label for a ledger line, e.g. "BUY 10 AAPL @ 185.2" for a
-- trade or "Dividends" for a cash transaction. Provider syncs fill this in;
-- nullable so manually entered rows don't require it.
alter table transactions add column description text;
