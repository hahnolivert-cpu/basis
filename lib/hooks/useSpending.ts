"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { SpendingPayload } from "@/app/api/spending/route";

export function useSpending() {
  return useSWR<SpendingPayload>("/api/spending", fetcher);
}
