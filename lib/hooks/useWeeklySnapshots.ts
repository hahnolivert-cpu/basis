"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { WeeklySnapshotsPayload } from "@/app/api/weekly-snapshots/route";

// Weekly history only changes once a week (Sunday cron), so no polling —
// revalidate on mount/focus. SWR dedupes this across every component that
// calls it, so TrackingTab and CurrencyLensCard share one request.
// `enabled: false` skips the fetch entirely (SWR's null-key convention) —
// the demo page has no session and would just get a 401 back.
export function useWeeklySnapshots({ enabled = true }: { enabled?: boolean } = {}) {
  return useSWR<WeeklySnapshotsPayload>(enabled ? "/api/weekly-snapshots" : null, fetcher);
}
