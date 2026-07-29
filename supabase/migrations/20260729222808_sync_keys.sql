-- Keys that make provider syncs idempotent.
--
-- holdings: a position is identified by account + symbol, so a sync can upsert
-- on that pair instead of accumulating duplicate rows each run.
alter table holdings add constraint holdings_account_symbol_key unique (account_id, symbol);

-- transactions: IBKR gives every trade a tradeID and every cash movement a
-- transactionID. Recording it lets re-running a sync skip rows already stored —
-- without this, pressing "Sync now" twice would double the transaction history.
-- Nullable so manually entered rows are still allowed (Postgres unique permits
-- multiple NULLs).
alter table transactions add column external_id text;
alter table transactions add constraint transactions_external_id_key unique (external_id);
