"use client";

import useSWR from "swr";
import type { WeeklySnapshotsPayload } from "@/app/api/weekly-snapshots/route";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Weekly history only changes once a week (Sunday cron), so no polling —
// revalidate on mount/focus. SWR dedupes this across every component that
// calls it, so TrackingTab and CurrencyLensCard share one request.
export function useWeeklySnapshots() {
  return useSWR<WeeklySnapshotsPayload>("/api/weekly-snapshots", fetcher);
}
