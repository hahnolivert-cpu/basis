"use client";

import { useState, useRef, type FormEvent } from "react";
import { useSWRConfig } from "swr";
import { T, mono, serif } from "@/lib/theme";
import { usd } from "@/lib/format";
import { Card, Eyebrow, Toggle } from "@/components/ui";
import { fetcher } from "@/lib/hooks/fetcher";
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
  color: T.ink,
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
  const [value, setValue] = useState("");
  const [assetClass, setAssetClass] = useState("Crypto");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // A real click can fire the handler more than once before React re-renders
  // with `disabled` set (the `busy` state guard only takes effect a tick
  // later) — observed as a single click on a toggle sending several PATCHes
  // back to back. With live-priced assets also revalidating in the
  // background, those overlapping requests can resolve out of order and
  // leave the UI on stale state. This ref is checked and set synchronously,
  // so a re-entrant call within the same tick is rejected outright rather
  // than racing on `busy`.
  const inFlight = useRef(false);

  // Sorted, not just filtered — the API has no explicit ORDER BY, so an
  // unsorted list can silently reorder between requests (e.g. right after a
  // toggle's own refresh). A row shifting under a user mid-interaction means
  // their next click lands on a different position than the one they saw,
  // which is exactly how a toggle click ends up hitting the wrong holding.
  const manual = holdings.filter((h) => h.institution === SELF_CUSTODY_INSTITUTION).sort((a, b) => a.sym.localeCompare(b.sym));

  // Fetches fresh data ourselves and writes it straight into the SWR cache,
  // rather than calling mutate(key) to trigger revalidation — that form
  // reuses whatever request SWR already has in flight for the key (its
  // dedupingInterval), which can be one that started before this write
  // landed, silently serving pre-write data as if it were fresh with nothing
  // to correct it until the next full reload.
  const refresh = async () => {
    const [holdings, quotes] = await Promise.all([fetcher("/api/holdings"), fetcher("/api/quotes")]);
    await Promise.all([
      mutate("/api/holdings", holdings, { revalidate: false }),
      mutate("/api/quotes", quotes, { revalidate: false }),
    ]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/holdings/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, name, qty, costBasis, value, assetClass }),
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
        setValue("");
        await refresh();
      }
    } catch (err) {
      setFailed(true);
      setNote(err instanceof Error ? err.message : String(err));
    }
    inFlight.current = false;
    setBusy(false);
  };

  const toggleIncluded = async (sym: string, included: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/holdings/manual", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym, includedInNetWorth: included }),
      });
      const body = await res.json();
      setFailed(!res.ok);
      setNote(res.ok ? `${sym} ${included ? "included in" : "excluded from"} net worth` : (body.error ?? "Could not update"));
      if (res.ok) await refresh();
    } catch (err) {
      setFailed(true);
      setNote(err instanceof Error ? err.message : String(err));
    }
    inFlight.current = false;
    setBusy(false);
  };

  const remove = async (sym: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
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
    inFlight.current = false;
    setBusy(false);
  };

  return (
    <Card style={{ marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
        <div>
          <Eyebrow style={{ marginBottom: 2 }}>Manual positions</Eyebrow>
          <div style={{ fontSize: 12, color: T.ink }}>
            Self-custody assets no sync can see — hardware wallet coins and the like. Priced live where a quote exists;
            provider syncs never touch these.
          </div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            cursor: "pointer", background: open ? T.card : T.gain, color: open ? T.gain : "#fff",
            border: `1px solid ${T.gain}`, borderRadius: 999, padding: "6px 14px",
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
          <div style={{ flex: "0 0 130px" }}>
            <label style={labelStyle}>Current value $</label>
            <input
              type="number"
              step="any"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="leave blank to use live price / cost"
              title="For an illiquid asset with no live quote — overrides cost basis as the current mark."
              style={inputStyle}
            />
          </div>
          <div style={{ flex: "0 0 120px" }}>
            <label style={labelStyle}>Class</label>
            <select value={assetClass} onChange={(e) => setAssetClass(e.target.value)} style={inputStyle}>
              <option value="Crypto">Crypto</option>
              <option value="Equities">Equities</option>
              <option value="Cash">Cash</option>
              <option value="Angel Investment">Angel Investment</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={busy}
            style={{
              cursor: busy ? "wait" : "pointer", background: T.gain, color: "#fff", border: "none",
              borderRadius: 8, padding: "9px 18px", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
            }}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      )}

      {/* Reserved regardless of whether a note is showing — otherwise the
          list below shifts down the instant one appears (right after the
          user's own click), so their next click lands on a row that's no
          longer where they saw it. */}
      <div style={{ marginTop: 12, minHeight: 17, fontSize: 12, fontFamily: mono, color: failed ? T.loss : T.gain }}>{note ?? ""}</div>

      {manual.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {manual.map((h) => (
            <div
              key={h.sym}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap",
                minHeight: 40, padding: "8px 0", borderTop: `1px solid ${T.line}`, fontSize: 13,
              }}
            >
              <span style={{ minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", flex: "1 1 auto" }}>
                <span style={{ fontWeight: 600 }}>{h.sym}</span>
                <span style={{ color: T.ink, fontSize: 11.5, marginLeft: 8 }}>
                  {h.name} · {h.acct}
                </span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 14, flexWrap: "wrap", flexShrink: 0 }}>
                <span style={{ fontFamily: mono, fontSize: 12, color: T.ink }}>{h.qty}</span>
                <span style={{ fontFamily: mono, fontWeight: 500 }}>{usd(h.value)}</span>
                <Toggle
                  on={h.includedInNetWorth}
                  setOn={(v) => toggleIncluded(h.sym, v)}
                  label={h.includedInNetWorth ? "In net worth" : "Excluded"}
                  disabled={busy}
                />
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
        <div style={{ marginTop: 14, fontFamily: serif, fontSize: 15, color: T.ink }}>
          Nothing added yet.
        </div>
      )}
    </Card>
  );
}
