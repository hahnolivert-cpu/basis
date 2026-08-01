import { createClient } from "@supabase/supabase-js";

// Service-role client for server-only code (app/api/* routes). Bypasses RLS —
// never import this in a Client Component or send this key to the browser.
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase dashboard →
// Settings → API → service_role key) — not yet set, since only the anon key
// was configured for auth so far.
//
// supabase-js issues its PostgREST calls through the global `fetch`, which in
// a Next.js route handler is Next's patched version — it can pull GET
// requests into the Data Cache even on a `force-dynamic` route, since that
// export only governs the route's own render, not every fetch a nested
// client library happens to make. Observed in production as a read-your-
// writes bug: a PATCH to /api/holdings/manual would report success, but the
// very next GET /api/holdings kept returning the pre-write value indefinitely
// (not just briefly — a hard cache, confirmed by writes never changing what
// subsequent reads returned). Passing an explicit no-store fetch here forces
// every Supabase call this client makes to bypass that cache.
export function createServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}
