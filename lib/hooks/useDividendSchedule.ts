"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { DividendSchedulePayload } from "@/app/api/dividend-schedule/route";

// Cached Polygon dividend records only change as often as /api/dividends
// refreshes them (daily), so no polling — revalidate on mount/focus.
export function useDividendSchedule() {
  return useSWR<DividendSchedulePayload>("/api/dividend-schedule", fetcher);
}
