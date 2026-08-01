import type { CSSProperties, ReactNode } from "react";
import { T, mono } from "@/lib/theme";
import { sign, usd } from "@/lib/format";

// `stacked` forces the $ amount and the (%) onto their own lines. Without it,
// the space between them is a normal line-break opportunity — whether a cell
// wraps to one line or two then depends on the text's own width relative to
// the column, so a table of these ends up with rows misaligned against each
// other for no visible reason. Opt-in rather than the default so it only
// changes layouts that ask for it.
export function Delta({ pct, amt, size = 13, weight, stacked }: { pct: number; amt: number; size?: number; weight?: number; stacked?: boolean }) {
  const color = pct >= 0 ? T.gain : T.loss;
  if (stacked) {
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.4, color, fontFamily: mono, fontSize: size, fontWeight: weight }}>
        <span>{sign(amt, usd(amt))}</span>
        <span style={{ opacity: 0.75 }}>({sign(pct, pct.toFixed(2))}%)</span>
      </span>
    );
  }
  return (
    <span style={{ color, fontFamily: mono, fontSize: size, fontWeight: weight }}>
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
    <div
      style={{
        fontSize: 12.5, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700,
        color: T.ink, marginBottom: 12, ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(21,32,25,0.45)", zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.card, border: `1px solid ${T.line}`, borderRadius: 12,
          width: "100%", maxWidth: 440, maxHeight: "80vh", overflow: "auto", padding: "20px 22px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: T.ink, fontSize: 20, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ on, setOn, label, disabled }: { on: boolean; setOn: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && setOn(!on)}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 9, cursor: disabled ? "wait" : "pointer",
        background: on ? T.ledger : T.card, color: on ? "#fff" : T.ink,
        border: `1px solid ${on ? T.ledger : T.line}`, borderRadius: 999,
        padding: "7px 14px", fontFamily: "inherit", fontSize: 13, fontWeight: 500, transition: "all 160ms ease",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{ width: 26, height: 14, borderRadius: 999, background: on ? "#ffffff44" : T.line, position: "relative", display: "inline-block" }}>
        <span style={{ position: "absolute", top: 2, left: on ? 14 : 2, width: 10, height: 10, borderRadius: "50%", background: on ? "#fff" : T.inkSoft, transition: "left 160ms ease" }} />
      </span>
      {label}
    </button>
  );
}
