import { NextResponse } from "next/server";

// Placeholder route establishing the app/api proxy pattern: every third-party
// call (Brex, IBKR, Plaid, Finnhub/CoinGecko, Polygon) is added here as its
// own route, never called directly from the browser.
export function GET() {
  return NextResponse.json({ status: "ok" });
}
