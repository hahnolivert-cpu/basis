-- Personal credit card spending, imported from bank-issued CSV statement
-- exports (Capital One today; source is a free-text column so another
-- issuer's export can land in the same table later). One row per line
-- item — amount_cents is signed: positive for a purchase, negative for a
-- refund/credit. Card payments (paying the statement balance) aren't
-- spending and are dropped at import time rather than stored here.
--
-- external_id makes re-uploading an overlapping statement period a no-op:
-- it's built from every CSV column plus an occurrence counter (so two
-- genuinely identical line items on the same day don't collide), and
-- import upserts on it.
create table card_spend (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'capital_one',
  card_last4 text not null,
  transaction_date date not null,
  posted_date date,
  description text not null,
  category text not null default 'Other',
  amount_cents integer not null,
  -- Set when this charge was actually a 976 Capital expense paid
  -- personally and reimbursed via Brex — excludes it from personal
  -- spending totals and counts it toward 976 instead. Free-text (not a
  -- boolean) so it reads as "reimbursed by whom" if that's ever not 976.
  reimbursed_by text,
  external_id text not null unique,
  created_at timestamptz not null default now()
);

create index card_spend_date_idx on card_spend (transaction_date);
create index card_spend_card_idx on card_spend (card_last4);

alter table card_spend enable row level security;
-- No policies — same pattern as every other table here (accounts, holdings,
-- snapshots, transactions, plaid_items): only the service_role key
-- (bypasses RLS) can read/write, from app/api/* routes.
