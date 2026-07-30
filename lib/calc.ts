import { ETF_DATA, CONTINENT_BY_GEO } from "./data";
import type { Holding, NamedValue } from "./types";

// Est. annualized money-weighted return over `months` of mock net-worth
// history. TODO: replace with XIRR over actual dated transactions and
// contributions once transaction data exists.
export const estIrr = (invVal: number, invCost: number, months: number) =>
  (Math.pow(invVal / invCost, 12 / months) - 1) * 100;

export const fvCalc = (P: number, monthly: number, annual: number, months: number) => {
  const r = annual / 12;
  if (r === 0) return P + monthly * months;
  const g = Math.pow(1 + r, months);
  return P * g + monthly * ((g - 1) / r);
};

export const reqMonthly = (target: number, P: number, annual: number, months: number) => {
  const r = annual / 12;
  const g = Math.pow(1 + r, months);
  if (r === 0) return (target - P) / months;
  return ((target - P * g) * r) / (g - 1);
};

export const reqReturn = (target: number, P: number, monthly: number, months: number): number | null => {
  if (fvCalc(P, monthly, 0, months) >= target) return 0;
  let lo = 0, hi = 0.6;
  if (fvCalc(P, monthly, hi, months) < target) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (fvCalc(P, monthly, mid, months) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

// `etf` only reflects whether we hold look-through constituent weights —
// gating the ETFs/Stocks split on it miscategorized funds we can't look
// through (e.g. BIDD) as plain stocks. `isEtf` is the actual fund-or-not
// heuristic (lib/holdings.ts looksLikeFund) and is what the DB payload
// carries; `etf` truthiness is kept only as a fallback for shapes that
// predate that field.
type MaybeFund = Holding & { isEtf?: boolean };
export const subclass = (h: MaybeFund) =>
  h.cls === "Equities" ? ((h.isEtf ?? Boolean(h.etf)) ? "ETFs" : "Stocks") : h.cls;

// Whether Cash/Crypto belong in a sector or geography breakdown is a
// per-chart, user-toggleable choice (NetWorthTab), not something this
// function decides — callers pre-filter `rows` before calling in.
export function aggregate(rows: Holding[], dim: "class" | "sector" | "geo", lookThrough: boolean): NamedValue[] {
  const map: Record<string, number> = {};
  const add = (k: string, v: number) => (map[k] = (map[k] || 0) + v);
  const geoKey = (k: string) => CONTINENT_BY_GEO[k] ?? k;
  for (const h of rows) {
    if (dim === "class") { add(subclass(h), h.value); continue; }
    if (h.etf) {
      if (lookThrough) {
        Object.entries(dim === "sector" ? ETF_DATA[h.etf].sectors : ETF_DATA[h.etf].geos).forEach(([k, w]) =>
          add(dim === "geo" ? geoKey(k) : k, h.value * w)
        );
      } else add("ETFs (opaque)", h.value);
      continue;
    }
    const raw = dim === "sector" ? (h.sector as string) : (h.geo as string);
    add(dim === "geo" ? geoKey(raw) : raw, h.value);
  }
  return Object.entries(map)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);
}

export type MergedHolding = Holding & { sources: string[] };

// Merges the same symbol held at multiple accounts (e.g. STRC at both IBKR
// and Robinhood) into one row. yld and day are value-weighted rather than
// taken from whichever row happened to be seen first, so a merged position's
// blended yield/day-change is actually correct, not just whichever account's
// number won the race.
export const mergeBySym = (hs: Holding[]): Holding[] => {
  const map: Record<string, Holding> = {};
  for (const h of hs) {
    const m = map[h.sym];
    if (!m) { map[h.sym] = { ...h }; continue; }
    const newValue = m.value + h.value;
    m.yld = newValue ? (m.yld * m.value + h.yld * h.value) / newValue : 0;
    m.day = newValue ? (m.day * m.value + h.day * h.value) / newValue : 0;
    m.value = newValue;
    m.cost += h.cost;
    m.qty = (m.qty ?? 0) + (h.qty ?? 0);
  }
  return Object.values(map);
};

export type SegmentPosition = { sym: string; name: string; value: number; via?: string };

// Backs the composition-chart drill-down modal: given the bucket name(s) a
// user clicked (a single sector/geo/class, or every bucket folded into an
// "Other" slice), returns the individual positions that make it up — ETF
// holdings appear once per constituent they contribute to the bucket, tagged
// with which fund they came in through.
export function positionsForSegment(
  rows: Holding[],
  dim: "class" | "sector" | "geo",
  keys: string[],
  lookThrough: boolean
): SegmentPosition[] {
  const wanted = new Set(keys);
  const geoKey = (k: string) => CONTINENT_BY_GEO[k] ?? k;
  const out: SegmentPosition[] = [];
  for (const h of rows) {
    if (dim === "class") {
      if (wanted.has(subclass(h))) out.push({ sym: h.sym, name: h.name, value: h.value });
      continue;
    }
    if (h.etf) {
      if (!lookThrough) {
        if (wanted.has("ETFs (opaque)")) out.push({ sym: h.sym, name: h.name, value: h.value });
        continue;
      }
      const weights = dim === "sector" ? ETF_DATA[h.etf].sectors : ETF_DATA[h.etf].geos;
      Object.entries(weights).forEach(([k, w]) => {
        if (wanted.has(dim === "geo" ? geoKey(k) : k)) out.push({ sym: h.sym, name: h.name, value: h.value * w, via: h.etf });
      });
      continue;
    }
    const raw = dim === "sector" ? (h.sector as string) : (h.geo as string);
    if (wanted.has(dim === "geo" ? geoKey(raw) : raw)) out.push({ sym: h.sym, name: h.name, value: h.value });
  }

  // The same symbol held at two accounts (e.g. STRC at both IBKR and
  // Robinhood) would otherwise list twice. Contributions via different ETFs
  // stay separate rows — they're genuinely different provenance, not a
  // duplicate — so the merge key includes `via`.
  const merged = new Map<string, SegmentPosition>();
  for (const p of out) {
    const key = `${p.sym}::${p.via ?? ""}`;
    const existing = merged.get(key);
    if (existing) existing.value += p.value;
    else merged.set(key, { ...p });
  }
  return Array.from(merged.values()).sort((a, b) => b.value - a.value);
}
