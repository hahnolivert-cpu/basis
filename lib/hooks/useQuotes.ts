"use client";

import useSWR from "swr";
import type { QuotesPayload } from "@/app/api/quotes/route";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useQuotes() {
  return useSWR<QuotesPayload>("/api/quotes", fetcher, { refreshInterval: 60_000 });
}
