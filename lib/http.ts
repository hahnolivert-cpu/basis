import { NextResponse } from "next/server";

// JSON response that is never cached.
//
// `export const dynamic = "force-dynamic"` only controls how Next renders a
// route on the server — it emits no response headers, so a browser with no
// caching directives falls back to heuristic caching and can serve a stale
// body without revalidating. Every route here returns live financial data, so
// they must all say no-store explicitly.
export function jsonNoStore(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: { ...init?.headers, "Cache-Control": "no-store, max-age=0, must-revalidate" },
  });
}

// Env vars whose values must never appear in a response body.
const SECRET_ENV_VARS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "PLAID_SECRET",
  "PLAID_CLIENT_ID",
  "BREX_API_TOKEN",
  "IBKR_FLEX_TOKEN",
  "FINNHUB_API_KEY",
  "POLYGON_API_KEY",
  "COINGECKO_API_KEY",
  "CRON_SECRET",
] as const;

// Credential shapes worth catching even when they didn't come from our own env
// — e.g. a Plaid access token echoed back inside an upstream error.
const SECRET_PATTERNS: RegExp[] = [
  /sb_secret_[A-Za-z0-9_\-]+/g,
  /sbp_[A-Za-z0-9]+/g,
  /bxt_[A-Za-z0-9]+/g,
  /access-(?:production|sandbox)-[A-Za-z0-9-]+/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, // JWTs
];

// Turns a thrown value into a message safe to return to the browser.
//
// Upstream libraries embed credentials in their errors — a malformed
// SUPABASE_SERVICE_ROLE_KEY made supabase-js throw a message containing the key
// itself, which this route then handed to the client. Never return raw error
// text from a path that touches credentials.
export function safeMessage(e: unknown): string {
  let msg = e instanceof Error ? e.message : String(e);

  for (const name of SECRET_ENV_VARS) {
    const value = process.env[name];
    // Ignore trivially short values, which would redact ordinary words.
    if (value && value.length >= 8) msg = msg.split(value).join(`[redacted ${name}]`);
  }
  for (const pattern of SECRET_PATTERNS) msg = msg.replace(pattern, "[redacted credential]");

  return msg;
}
