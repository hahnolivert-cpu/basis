import { ETF_DATA } from "./data";
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

export const subclass = (h: Holding) => (h.cls === "Equities" ? (h.etf ? "ETFs" : "Stocks") : h.cls);

export function aggregate(rows: Holding[], dim: "class" | "sector" | "geo", lookThrough: boolean): NamedValue[] {
  const map: Record<string, number> = {};
  const add = (k: string, v: number) => (map[k] = (map[k] || 0) + v);
  for (const h of rows) {
    if (dim === "class") { add(subclass(h), h.value); continue; }
    if (h.etf) {
      if (lookThrough) {
        Object.entries(dim === "sector" ? ETF_DATA[h.etf].sectors : ETF_DATA[h.etf].geos).forEach(([k, w]) => add(k, h.value * w));
      } else add("ETFs (opaque)", h.value);
      continue;
    }
    add(dim === "sector" ? (h.sector as string) : (h.geo as string), h.value);
  }
  return Object.entries(map)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);
}

export type MergedHolding = Holding & { sources: string[] };

export const mergeBySym = (hs: Holding[]): Holding[] => {
  const map: Record<string, Holding> = {};
  for (const h of hs) {
    if (!map[h.sym]) map[h.sym] = { ...h };
    else { map[h.sym].value += h.value; map[h.sym].cost += h.cost; }
  }
  return Object.values(map);
};

export const LIQ_TIER = (h: Holding) =>
  h.cls === "Crypto" ? "24/7 · crypto"
    : h.sym === "Brex Treasury" || h.sym === "SGOV" ? "T+1 · treasury"
    : h.cls === "Cash" ? "Instant · checking"
    : "T+2 · market";
