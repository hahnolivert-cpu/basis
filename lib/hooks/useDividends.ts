"use client";

import useSWR from "swr";
import type { DividendsPayload } from "@/app/api/dividends/route";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Dividend yields only change daily, so this just revalidates on mount/focus
// rather than polling like useQuotes.
export function useDividends() {
  return useSWR<DividendsPayload>("/api/dividends", fetcher);
}
