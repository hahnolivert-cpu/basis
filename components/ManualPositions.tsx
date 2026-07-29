"use client";

import { useState, type FormEvent } from "react";
import { useSWRConfig } from "swr";
import { T, mono, serif } from "@/lib/theme";
import { usd } from "@/lib/format";
import { Card, Eyebrow } from "@/components/ui";
import type { Holding } from "@/lib/types";

// Matched on institution, not is_manual: seeded provider estimates also carry
// is_manual, and only the self-custody account is genuinely user-entered.
const SELF_CUSTODY_INSTITUTION = "Self-custody";

type ManualHolding = Holding & { isManual?: boolean; institution?: string };

const inputStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 13,
  padding: "7px 9px",
  border: `1px solid ${T.line}`,
  borderRadius: 8,
  background: T.card,
  color: T.ink,
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: T.inkSoft,
  marginBottom: 5,
  display: "block",
};

export function ManualPositions({ holdings }: { holdings: ManualHolding[] }) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [costBasis, setCostBasis] = useState("");
  const [assetClass, setAssetClass] = useState("Crypto");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const manual = holdings.filter((h) => h.institution === SELF_CUSTODY_INSTITUTION);

  const refresh = () => Promise.all([mutate("/api/holdings"), mutate("/api/quotes")]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/holdings/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, name, qty, costBasis, assetClass }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFailed(true);
        setNote(body.error ?? "Could not save");
      } else {
        setFailed(false);
        setNote(
          body.pricedFrom
            ? `Saved ${body.symbol} · valued from ${body.pricedFrom}`
            : `Saved ${body.symbol} · no live quote found, valued at cost`
        );
        setSymbol("");
        setName("");
        setQty("");
        setCostBasis("");
        await refresh();
      }
    } catch (err) {
      setFailed(true);
      setNote(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  };

  const remove = async (sym: string) => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/holdings/manual?symbol=${encodeURIComponent(sym)}`, { method: "DELETE" });
      const body = await res.json();
      setFailed(!res.ok);
      setNote(res.ok ? `Removed ${sym}` : (body.error ?? "Could not remove"));
      if (res.ok) await refresh();
    } catch (err) {
      setFailed(true);
      setNote(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  };

  return (
    <Card style={{ marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
        <div>
          <Eyebrow style={{ marginBottom: 2 }}>Manual positions</Eyebrow>
          <div style={{ fontSize: 12, color: T.inkSoft }}>
            Self-custody assets no sync can see — hardware wallet coins and the like. Priced live where a quote exists;
            provider syncs never touch these.
          </div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            cursor: "pointer", background: open ? T.card : T.ledger, color: open ? T.ledger : "#fff",
            border: `1px solid ${T.ledger}`, borderRadius: 999, padding: "6px 14px",
            fontFamily: "inherit", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
          }}
        >
          {open ? "Close" : "+ Add position"}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "0 0 110px" }}>
            <label style={labelStyle}>Symbol</label>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="BTC" required style={inputStyle} />
          </div>
          <div style={{ flex: "1 1 170px" }}>
            <label style={labelStyle}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bitcoin · Ledger" style={inputStyle} />
          </div>
          <div style={{ flex: "0 0 120px" }}>
            <label style={labelStyle}>Quantity</label>
            <input
              type="number"
              step="any"
              min="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0.25"
              required
              style={inputStyle}
            />
          </div>
          <div style={{ flex: "0 0 130px" }}>
            <label style={labelStyle}>Cost basis $</label>
            <input
              type="number"
              step="any"
              min="0"
              value={costBasis}
              onChange={(e) => setCostBasis(e.target.value)}
              placeholder="12000"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: "0 0 120px" }}>
            <label style={labelStyle}>Class</label>
            <select value={assetClass} onChange={(e) => setAssetClass(e.target.value)} style={inputStyle}>
              <option value="Crypto">Crypto</option>
              <option value="Equities">Equities</option>
              <option value="Cash">Cash</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={busy}
            style={{
              cursor: busy ? "wait" : "pointer", background: T.ledger, color: "#fff", border: "none",
              borderRadius: 8, padding: "9px 18px", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
            }}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      )}

      {note && (
        <div style={{ marginTop: 12, fontSize: 12, fontFamily: mono, color: failed ? T.loss : T.gain }}>{note}</div>
      )}

      {manual.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {manual.map((h) => (
            <div
              key={h.sym}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                padding: "8px 0", borderTop: `1px solid ${T.line}`, fontSize: 13,
              }}
            >
              <span>
                <span style={{ fontWeight: 600 }}>{h.sym}</span>
                <span style={{ color: T.inkSoft, fontSize: 11.5, marginLeft: 8 }}>
                  {h.name} · {h.acct}
                </span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontFamily: mono, fontSize: 12, color: T.inkSoft }}>{h.qty}</span>
                <span style={{ fontFamily: mono, fontWeight: 500 }}>{usd(h.value)}</span>
                <button
                  onClick={() => remove(h.sym)}
                  disabled={busy}
                  title={`Remove ${h.sym}`}
                  style={{
                    cursor: busy ? "wait" : "pointer", background: "none", border: `1px solid ${T.line}`,
                    borderRadius: 6, padding: "3px 9px", fontFamily: "inherit", fontSize: 11, color: T.loss,
                  }}
                >
                  Remove
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {manual.length === 0 && !open && (
        <div style={{ marginTop: 14, fontFamily: serif, fontSize: 15, color: T.inkSoft }}>
          Nothing added yet.
        </div>
      )}
    </Card>
  );
}
