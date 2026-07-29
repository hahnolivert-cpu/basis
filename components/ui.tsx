import type { CSSProperties, ReactNode } from "react";
import { T, mono } from "@/lib/theme";
import { sign, usd } from "@/lib/format";

export function Delta({ pct, amt, size = 13 }: { pct: number; amt: number; size?: number }) {
  return (
    <span style={{ color: pct >= 0 ? T.gain : T.loss, fontFamily: mono, fontSize: size }}>
      {sign(amt, usd(amt))} <span style={{ opacity: 0.75 }}>({sign(pct, pct.toFixed(2))}%)</span>
    </span>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, padding: "18px 20px", ...style }}>
      {children}
    </div>
  );
}

export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: T.inkSoft, marginBottom: 12, ...style }}>
      {children}
    </div>
  );
}

export function Toggle({ on, setOn, label }: { on: boolean; setOn: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => setOn(!on)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 9, cursor: "pointer",
        background: on ? T.ledger : T.card, color: on ? "#fff" : T.ink,
        border: `1px solid ${on ? T.ledger : T.line}`, borderRadius: 999,
        padding: "7px 14px", fontFamily: "inherit", fontSize: 13, fontWeight: 500, transition: "all 160ms ease",
      }}
    >
      <span style={{ width: 26, height: 14, borderRadius: 999, background: on ? "#ffffff44" : T.line, position: "relative", display: "inline-block" }}>
        <span style={{ position: "absolute", top: 2, left: on ? 14 : 2, width: 10, height: 10, borderRadius: "50%", background: on ? "#fff" : T.inkSoft, transition: "left 160ms ease" }} />
      </span>
      {label}
    </button>
  );
}
