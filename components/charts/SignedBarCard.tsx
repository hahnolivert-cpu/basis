import { T, mono } from "@/lib/theme";
import { Card, Eyebrow } from "@/components/ui";

type Row = { name: string; v: number; pct?: number };

const pctLabel = (pct: number) => `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;

// Plain flexbox bars instead of a recharts BarChart. The previous version drew
// each row's value label as SVG text anchored right at the zero baseline (on
// the bar's empty side), which reads fine on a wide chart but on a narrow one
// the zero-crossing point can land close to the fixed-width axis labels —
// exactly when one side of the data dominates (e.g. a few big gainers against
// many small losers) — so the value text collided with the ticker name. Value
// now lives in its own flex column that never overlaps anything, at any width.
export function SignedBarCard({
  title,
  rows,
  fmtV,
  note,
}: {
  title: string;
  rows: Row[];
  fmtV: (v: number) => string;
  note?: string;
}) {
  const domainMin = Math.min(0, ...rows.map((r) => r.v));
  const domainMax = Math.max(0, ...rows.map((r) => r.v));
  const range = domainMax - domainMin || 1;
  const zeroPct = ((0 - domainMin) / range) * 100;

  return (
    <Card style={{ flex: 1, minWidth: "min(300px, 100%)" }}>
      <Eyebrow>{title}</Eyebrow>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => {
          const positive = r.v >= 0;
          const barPct = (Math.abs(r.v) / range) * 100;
          const color = positive ? T.gain : T.loss;
          return (
            <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 56, flexShrink: 0, fontFamily: mono, fontSize: 11, color: T.ink,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
                title={r.name}
              >
                {r.name}
              </div>
              <div style={{ flex: 1, minWidth: 0, position: "relative", height: 14, background: "#F4F7F5", borderRadius: 3 }}>
                <div style={{ position: "absolute", top: 0, bottom: 0, left: `${zeroPct}%`, width: 1, background: T.line }} />
                <div
                  style={{
                    position: "absolute", top: 0, bottom: 0,
                    left: `${positive ? zeroPct : zeroPct - barPct}%`, width: `${barPct}%`,
                    background: color, borderRadius: 3,
                  }}
                />
              </div>
              <div style={{ flexShrink: 0, textAlign: "right", fontFamily: mono, fontSize: 10.5, fontWeight: 600, color, whiteSpace: "nowrap" }}>
                {fmtV(r.v)}
                {r.pct !== undefined && <span style={{ opacity: 0.75 }}> ({pctLabel(r.pct)})</span>}
              </div>
            </div>
          );
        })}
      </div>
      {note && <div style={{ fontSize: 11.5, color: T.ink, marginTop: 10 }}>{note}</div>}
    </Card>
  );
}
