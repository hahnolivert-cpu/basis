"use client";

import { useMemo } from "react";
import { T, mono, serif } from "@/lib/theme";
import { mergeBySym } from "@/lib/calc";
import { Card } from "@/components/ui";
import { useEarnings } from "@/lib/hooks/useEarnings";
import type { Holding } from "@/lib/types";
import type { SymbolEarnings } from "@/app/api/earnings/route";

// Revenue estimates run into the billions — usd()/usdK() top out at "$XM"
// and would print an unreadable 6-digit millions figure.
function usdCompact(n: number | null): string {
  if (n === null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

function daysUntil(dateStr: string): number {
  const target = new Date(`${dateStr}T00:00:00Z`).getTime();
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86400000);
}

const EMPTY: SymbolEarnings[] = [];

export function EarningsTab({ holdings }: { holdings: Holding[] }) {
  const { data, isLoading } = useEarnings();
  const earnings = data?.earnings ?? EMPTY;

  const nameBySymbol = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of mergeBySym(holdings)) map.set(h.sym, h.name);
    return map;
  }, [holdings]);

  const sorted = useMemo(
    () =>
      [...earnings].sort((a, b) => {
        if (a.nextDate && b.nextDate) return a.nextDate.localeCompare(b.nextDate);
        if (a.nextDate) return -1;
        if (b.nextDate) return 1;
        return a.symbol.localeCompare(b.symbol);
      }),
    [earnings]
  );

  return (
    <div>
      <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 600, marginTop: 22, marginBottom: 4 }}>Earnings</div>
      <div style={{ fontSize: 12.5, color: T.ink, marginBottom: 18 }}>
        Next report date and analyst estimates, and how each company did the last several quarters (reported actuals
        vs. estimate). Real numbers from Finnhub — not a transcript of the call itself, which needs a paid plan we
        don&apos;t have.
      </div>

      {isLoading && <div style={{ fontSize: 12.5, color: T.ink, fontFamily: mono }}>Loading earnings data…</div>}
      {!isLoading && sorted.length === 0 && (
        <div style={{ fontSize: 12.5, color: T.ink, fontFamily: mono }}>
          {data?.errors?.length ? `Could not load earnings data: ${data.errors.join(", ")}` : "No equity holdings to show earnings for."}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {sorted.map((e) => {
          const name = nameBySymbol.get(e.symbol) ?? e.symbol;
          const days = e.nextDate ? daysUntil(e.nextDate) : null;
          return (
            <Card key={e.symbol}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                <div>
                  <span style={{ fontFamily: mono, fontWeight: 700, color: T.ledger, fontSize: 15 }}>{e.symbol}</span>
                  <span style={{ color: T.ink, fontSize: 12, marginLeft: 8 }}>{name}</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  {e.nextDate ? (
                    <>
                      <div style={{ fontFamily: mono, fontSize: 13, color: T.ink }}>
                        Next: {e.nextDate} {days !== null && days >= 0 ? `· in ${days}d` : ""}
                      </div>
                      <div style={{ fontSize: 11.5, color: T.ink, fontFamily: mono }}>
                        Est. EPS {e.nextEpsEstimate?.toFixed(2) ?? "—"} · Est. revenue {usdCompact(e.nextRevenueEstimate)}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontFamily: mono, fontSize: 12.5, color: T.ink }}>No upcoming date scheduled</div>
                  )}
                </div>
              </div>

              {e.history.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <div style={{ minWidth: 480 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: "0 4px", borderBottom: `1px solid ${T.line}` }}>
                      {["Quarter", "EPS actual", "EPS estimate", "Surprise"].map((label, i) => (
                        <div
                          key={label}
                          style={{
                            fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500,
                            color: T.ink, textAlign: i === 0 ? "left" : "right", padding: "6px 0",
                          }}
                        >
                          {label}
                        </div>
                      ))}
                    </div>
                    {e.history.map((q) => (
                      <div
                        key={q.period}
                        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: "0 4px", borderBottom: `1px solid ${T.line}`, fontSize: 12.5 }}
                      >
                        <div style={{ padding: "6px 0", fontFamily: mono, color: T.ink }}>
                          Q{q.quarter} {q.year} <span style={{ color: T.ink, fontSize: 10.5 }}>({q.period})</span>
                        </div>
                        <div style={{ padding: "6px 0", textAlign: "right", fontFamily: mono }}>{q.epsActual?.toFixed(2) ?? "—"}</div>
                        <div style={{ padding: "6px 0", textAlign: "right", fontFamily: mono, color: T.ink }}>{q.epsEstimate?.toFixed(2) ?? "—"}</div>
                        <div style={{ padding: "6px 0", textAlign: "right", fontFamily: mono, color: q.surprisePercent === null ? T.ink : q.surprisePercent >= 0 ? T.gain : T.loss }}>
                          {q.surprisePercent !== null ? `${q.surprisePercent >= 0 ? "+" : ""}${q.surprisePercent.toFixed(1)}%` : "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
