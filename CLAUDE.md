# Basis

Single-user personal portfolio and net worth tracker. There is no auth, multi-tenancy,
or account system — this app is built for one person's finances.

## Data sources (planned)

- **Brex** API — cash/checking + treasury balances
- **IBKR Flex** — brokerage holdings and transactions
- **Plaid** — Chase and Robinhood accounts
- **Finnhub** / **CoinGecko** — live equity and crypto prices
- **Polygon** — dividend data

None of these are wired up yet. The app currently runs on the static `BASE_HOLDINGS`
data in [lib/data.ts](lib/data.ts), seeded from account screenshots.

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
