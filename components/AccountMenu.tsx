"use client";

import { useEffect, useRef, useState } from "react";
import { T, mono } from "@/lib/theme";
import { SyncButton } from "@/components/SyncButton";

const itemStyle: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left", padding: "10px 14px", fontSize: 13, color: T.ink,
  fontFamily: "inherit", background: "none", border: "none", cursor: "pointer", textDecoration: "none",
  whiteSpace: "nowrap",
};

// Connect / Sync / Account settings / Sign out used to be four separate
// pills in the header — fine on a wide screen, but they wrapped to a second
// row anywhere narrower. Folding them into one menu keeps the header a
// single row at every width, at the cost of an extra click to reach any one
// of them. The data-freshness line ("live · as of...") used to sit next to
// these in the header too — moved in here since it's informational, not
// something that needs to be visible at a glance.
export function AccountMenu({ statusText, onSignOut }: { statusText: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          fontSize: 12, color: T.inkSoft, fontFamily: mono, background: "none", cursor: "pointer",
          border: `1px solid ${T.line}`, borderRadius: 999, padding: "6px 13px",
        }}
      >
        Account {open ? "▴" : "▾"}
      </button>
      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, background: T.card,
            border: `1px solid ${T.line}`, borderRadius: 10, boxShadow: "0 10px 28px rgba(21,32,25,0.14)",
            minWidth: 190, overflow: "hidden", zIndex: 20,
          }}
        >
          <div style={{ padding: "10px 14px", fontSize: 11.5, color: T.inkSoft, fontFamily: mono, borderBottom: `1px solid ${T.line}`, whiteSpace: "nowrap" }}>
            {statusText}
          </div>
          <a href="/link" style={itemStyle} onClick={() => setOpen(false)}>
            + Connect an account
          </a>
          <div style={{ ...itemStyle, cursor: "default" }} onClick={(e) => e.stopPropagation()}>
            <SyncButton />
          </div>
          <a href="/account" style={{ ...itemStyle, borderTop: `1px solid ${T.line}` }} onClick={() => setOpen(false)}>
            Account settings
          </a>
          <button onClick={onSignOut} style={{ ...itemStyle, color: T.loss }}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
