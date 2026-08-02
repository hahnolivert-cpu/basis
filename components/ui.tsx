import type { CSSProperties, ReactNode } from "react";
import { T, mono } from "@/lib/theme";
import { sign, usd } from "@/lib/format";

// `stacked` forces the $ amount and the (%) onto their own lines. Without it,
// the space between them is a normal line-break opportunity — whether a cell
// wraps to one line or two then depends on the text's own width relative to
// the column, so a table of these ends up with rows misaligned against each
// other for no visible reason. Opt-in rather than the default so it only
// changes layouts that ask for it.
export function Delta({ pct, amt, size = 13, weight, stacked }: { pct: number; amt: number; size?: number | string; weight?: number; stacked?: boolean }) {
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

const TOGGLE_SIZES = {
  md: { padding: "7px 14px", gap: 9, fontSize: 13, trackW: 26, trackH: 14, knob: 10, inset: 2 },
  sm: { padding: "4px 9px", gap: 6, fontSize: 11, trackW: 20, trackH: 11, knob: 7, inset: 2 },
};

export function Toggle({
  on,
  setOn,
  label,
  disabled,
  size = "md",
}: {
  on: boolean;
  setOn: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const s = TOGGLE_SIZES[size];
  return (
    <button
      onClick={() => !disabled && setOn(!on)}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: s.gap, cursor: disabled ? "wait" : "pointer",
        background: on ? T.gain : T.card, color: on ? "#fff" : T.ink,
        border: `1px solid ${on ? T.gain : T.line}`, borderRadius: 999,
        padding: s.padding, fontFamily: "inherit", fontSize: s.fontSize, fontWeight: 500, transition: "all 160ms ease",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{ width: s.trackW, height: s.trackH, borderRadius: 999, background: on ? "#ffffff44" : T.line, position: "relative", display: "inline-block", flexShrink: 0 }}>
        <span
          style={{
            position: "absolute", top: (s.trackH - s.knob) / 2, left: on ? s.trackW - s.knob - s.inset : s.inset,
            width: s.knob, height: s.knob, borderRadius: "50%", background: on ? "#fff" : T.inkSoft, transition: "left 160ms ease",
          }}
        />
      </span>
      {label}
    </button>
  );
}
