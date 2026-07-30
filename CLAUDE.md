# Basis

Single-user personal portfolio and net worth tracker — no multi-tenancy. Auth is
Supabase email/password (`@supabase/ssr`, cookie-based sessions).

### Access control — two locks, both required

1. **Sign-ups are disabled at the Supabase project level** (`disable_signup`).
   Hiding the form via `SIGNUPS_ENABLED` in [lib/auth-config.ts](lib/auth-config.ts)
   is *not* sufficient: the anon key ships in the browser bundle by design, so
   `POST /auth/v1/signup` stays reachable and anyone could self-register.
2. **`BASIS_OWNER_EMAIL` gates the middleware.** Being authenticated is not
   enough — the session must belong to the owner, or any account that ever gets
   created could read the whole portfolio. Unset means no restriction, so a
   missing env var cannot lock the owner out.

Supabase Auth `site_url` must point at the deployed domain, otherwise password
reset and confirmation emails link to localhost.

## Data sources (planned)

- **Brex** API — cash/checking + treasury balances
- **IBKR Flex** — brokerage holdings and transactions
- **Plaid** — Chase and Robinhood accounts
- **Finnhub** / **CoinGecko** — live equity and crypto prices
- **Polygon** — dividend data

**IBKR, Finnhub, CoinGecko and Polygon are live.** Brex and Plaid are not yet.

The dashboard reads holdings from Supabase via [lib/holdings.ts](lib/holdings.ts).
`BASE_HOLDINGS` in [lib/data.ts](lib/data.ts) is now only a fallback for before
the first sync, or if the database is unreachable.

### Sync architecture

- `lib/sync/*` holds provider sync logic as plain functions; `app/api/sync/*`
  are thin wrappers. **Never call an `/api/*` route over HTTP from the cron** —
  those routes sit behind the session middleware and a scheduled run carries no
  cookie, so the call 401s and silently falls back to stale data. Call the lib
  function in-process instead.
- Syncs are idempotent: holdings upsert on `(account_id, symbol)`, transactions
  on `external_id` (IBKR's tradeID/transactionID).
- Provider tickers differ per API — IBKR writes `BTC.USD-PAXOS` and `BRK B`,
  Finnhub wants `BRK.B`, CoinGecko wants `bitcoin`. `quoteRefFor()` normalises.
- Manual/self-custody positions live in an account with
  `institution = 'Self-custody'`. Identify them by **institution, not
  `is_manual`** — every seeded row also carries `is_manual`, so matching on it
  makes a symbol ambiguous across accounts.
- IBKR cash uses the Flex `BASE_SUMMARY` row, which is already FX-converted.
  Summing the per-currency rows would add EUR to USD as if they were one unit.

## Data model

Postgres schema lives in `supabase/migrations/` (Supabase CLI; project linked via
`supabase link --project-ref qhcjgkndxccnkptbhfuv`). Tables: `accounts`, `holdings`,
`snapshots` (daily per-account value + EURUSD/BTCUSD closes), `transactions`
(dated cash flows, for real XIRR later), `plaid_items` (institution + access
token + sync cursor). All five have RLS enabled with no policies — only the
`service_role` key (bypasses RLS) can read/write, from `app/api/*` routes only,
via [lib/supabase/service.ts](lib/supabase/service.ts). `SUPABASE_SERVICE_ROLE_KEY`
still needs to be added to `.env.local` before any server route can use it.

## Architecture rules

- **API keys live in env vars only.** Never hardcode a key, commit one, or read one
  into client-side code.
- **All third-party calls go through `app/api/` proxy routes.** The browser never
  calls Brex, IBKR, Plaid, Finnhub, CoinGecko, or Polygon directly — it calls our own
  `app/api/*` routes, which hold the keys server-side and call out from there.
- **Money is stored as integer cents**, not floats/dollars, to avoid rounding drift.
  (Note: the current `BASE_HOLDINGS` prototype data is still in dollars as ported
  from the design reference — convert to cents when real data sources replace it.)
- **The UI must always match [design-reference/prototype.jsx](design-reference/prototype.jsx).**
  That file is the visual source of truth: Fraunces + IBM Plex Mono fonts, the green
  ledger color palette, spacing, and layout. Any UI change should be checked against
  it before merging.
