"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { MonthlyFlowsPayload } from "@/app/api/monthly-flows/route";

export function useMonthlyFlows() {
  return useSWR<MonthlyFlowsPayload>("/api/monthly-flows", fetcher);
}
