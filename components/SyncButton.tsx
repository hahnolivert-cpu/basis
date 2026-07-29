"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { T, mono } from "@/lib/theme";

type Result = { target: string; ok: boolean; error?: string; applied?: Record<string, number> };

export function SyncButton() {
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/sync", { method: "POST", cache: "no-store" });
      const body = await res.json();
      const results: Result[] = body.results ?? [];

      const bad = results.filter((r) => !r.ok);
      setFailed(bad.length > 0);

      if (bad.length) {
        setNote(bad.map((r) => `${r.target}: ${r.error ?? "failed"}`).join(" · "));
      } else {
        const totals = results.reduce(
          (acc, r) => {
            for (const [k, v] of Object.entries(r.applied ?? {})) acc[k] = (acc[k] ?? 0) + v;
            return acc;
          },
          {} as Record<string, number>
        );
        const parts = Object.entries(totals)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${v} ${k}`);
        setNote(parts.length ? `Synced ${parts.join(", ")}` : "Already up to date");
      }

      // Pull the refreshed holdings/quotes through the dashboard's hooks.
      await Promise.all([mutate("/api/quotes"), mutate("/api/dividends"), mutate("/api/weekly-snapshots")]);
    } catch (e) {
      setFailed(true);
      setNote(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      {note && (
        <span style={{ fontSize: 11.5, fontFamily: mono, color: failed ? T.loss : T.gain, maxWidth: 380, textAlign: "right" }}>
          {note}
        </span>
      )}
      <button
        onClick={run}
        disabled={busy}
        style={{
          cursor: busy ? "wait" : "pointer",
          background: T.card,
          color: T.ledger,
          border: `1px solid ${T.ledger}`,
          borderRadius: 999,
          padding: "6px 14px",
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 600,
          animation: busy ? "pulse 1.2s infinite" : "none",
        }}
      >
        {busy ? "Syncing…" : "↻ Sync now"}
      </button>
    </span>
  );
}
