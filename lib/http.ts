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
