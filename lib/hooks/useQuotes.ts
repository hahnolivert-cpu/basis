"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { QuotesPayload } from "@/app/api/quotes/route";

export function useQuotes() {
  return useSWR<QuotesPayload>("/api/quotes", fetcher, { refreshInterval: 60_000 });
}
