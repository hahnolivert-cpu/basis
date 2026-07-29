import { createClient } from "@supabase/supabase-js";

// Service-role client for server-only code (app/api/* routes). Bypasses RLS —
// never import this in a Client Component or send this key to the browser.
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase dashboard →
// Settings → API → service_role key) — not yet set, since only the anon key
// was configured for auth so far.
export function createServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
