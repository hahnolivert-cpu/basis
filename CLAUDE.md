# Basis

Single-user personal portfolio and net worth tracker — no multi-tenancy. Auth is
Supabase email/password (`@supabase/ssr`, cookie-based sessions); sign-ups are
disabled in [lib/auth-config.ts](lib/auth-config.ts) once the one account exists.

## Data sources (planned)

- **Brex** API — cash/checking + treasury balances
- **IBKR Flex** — brokerage holdings and transactions
- **Plaid** — Chase and Robinhood accounts
- **Finnhub** / **CoinGecko** — live equity and crypto prices
- **Polygon** — dividend data

None of these are wired up yet. The app UI currently runs on the static
`BASE_HOLDINGS` data in [lib/data.ts](lib/data.ts), seeded from account
screenshots — it does not read from the database below yet.

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
