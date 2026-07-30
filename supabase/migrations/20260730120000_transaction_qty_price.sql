-- Per-unit price and quantity for a trade, so a purchase can be shown as
-- "bought N @ $P" and its performance tracked since. Nullable: dividends,
-- interest, and transfers have no price/quantity, and rows synced before
-- this migration won't have it backfilled.
alter table transactions add column qty numeric;
alter table transactions add column price_cents bigint;
