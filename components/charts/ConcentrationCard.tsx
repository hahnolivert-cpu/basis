import type { ReactNode } from "react";
import { T, mono, serif } from "@/lib/theme";
import { usd } from "@/lib/format";
import { mergeBySym } from "@/lib/calc";
import { Card, Eyebrow } from "@/components/ui";
import type { Holding } from "@/lib/types";

export function ConcentrationCard({
  holdings,
  total,
  headerRight,
}: {
  holdings: Holding[];
  total: number;
  // Crypto/Cash include toggles, rendered next to the title like every
  // other composition chart on this tab.
  headerRight?: ReactNode;
}) {
  const top = mergeBySym(holdings).sort((a, b) => b.value - a.value).slice(0, 15);
  const share = top.reduce((s, h) => s + h.value, 0) / total;
  return (
    <Card style={{ flex: 1, minWidth: "min(300px, 100%)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Eyebrow>Concentration</Eyebrow>
        {headerRight}
      </div>
      <div style={{ fontFamily: serif, fontSize: 30, fontWeight: 600 }}>
        {(share * 100).toFixed(0)}%
        <span style={{ fontSize: 14, color: T.ink, fontFamily: "inherit", fontWeight: 400 }}> of assets in top 15 positions</span>
      </div>
      <div style={{ marginTop: 12 }}>
        {top.map((h) => (
          <div key={h.sym} style={{ marginBottom: 9 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
              <span style={{ fontWeight: 600 }}>{h.sym}</span>
              <span style={{ fontFamily: mono, color: T.ink }}>{usd(h.value)} · {((h.value / total) * 100).toFixed(1)}%</span>
            </div>
            <div style={{ height: 7, background: "#EDF2EE", borderRadius: 4 }}>
              <div style={{ height: "100%", width: `${(h.value / total) * 100}%`, background: T.gain, borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
