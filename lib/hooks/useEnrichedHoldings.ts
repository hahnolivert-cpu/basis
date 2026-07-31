"use client";

import { useMemo } from "react";
import { useHoldings } from "./useHoldings";
import { useQuotes } from "./useQuotes";
import { useDividends } from "./useDividends";

// Reprices qty-based holdings from live quotes and overlays the daily
// Polygon yield cache on top of the raw Supabase row — the same enrichment
// the main dashboard applies, extracted so any other page needing "what do
// I actually hold, priced and yielding right now" (e.g. the expected-
// dividend projection) doesn't drift from it by recomputing separately.
export function useEnrichedHoldings() {
  const { data: holdingsData } = useHoldings();
  const { data: quotes } = useQuotes();
  const { data: dividends } = useDividends();

  const holdings = useMemo(
    () =>
      (holdingsData?.holdings ?? []).map((h) => {
        const q = h.qty ? quotes?.quotes[h.sym] : undefined;
        const yld = dividends?.yields[h.sym];
        return {
          ...h,
          value: q ? h.qty! * q.price : h.value,
          day: q ? q.day : h.day,
          yld: yld ?? h.yld,
        };
      }),
    [holdingsData, quotes, dividends]
  );

  return { holdings, isLoading: !holdingsData };
}
