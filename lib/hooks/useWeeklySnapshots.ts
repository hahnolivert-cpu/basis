"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { WeeklySnapshotsPayload } from "@/app/api/weekly-snapshots/route";

// Weekly history only changes once a week (Sunday cron), so no polling —
// revalidate on mount/focus. SWR dedupes this across every component that
// calls it, so TrackingTab and CurrencyLensCard share one request.
export function useWeeklySnapshots() {
  return useSWR<WeeklySnapshotsPayload>("/api/weekly-snapshots", fetcher);
}
