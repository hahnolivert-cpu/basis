"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePlaidLink } from "react-plaid-link";
import { T, mono, serif, sans } from "@/lib/theme";
import { Card, Eyebrow } from "@/components/ui";

type Target = { institution: string; products: string; blurb: string };

// Chase is a checking account and Robinhood an investment one; Plaid needs the
// matching product per institution or Link offers no selectable accounts.
const TARGETS: Target[] = [
  { institution: "Chase", products: "transactions", blurb: "checking balances" },
  { institution: "Robinhood", products: "investments", blurb: "investment holdings" },
];

function LinkButton({ target, onLinked }: { target: Target; onLinked: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSuccess = useCallback(
    async (publicToken: string) => {
      setBusy(true);
      setStatus("Exchanging token…");
      try {
        const res = await fetch("/api/plaid/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_token: publicToken, institution: target.institution }),
        });
        const body = await res.json();
        setFailed(!res.ok);
        setStatus(res.ok ? `${target.institution} connected` : (body.error ?? "Exchange failed"));
        if (res.ok) onLinked();
      } catch (e) {
        setFailed(true);
        setStatus(e instanceof Error ? e.message : String(e));
      }
      setBusy(false);
    },
    [target.institution, onLinked]
  );

  const { open, ready } = usePlaidLink({
    // Null until the token has been fetched; open() is gated on `ready`.
    token: token as string,
    // react-plaid-link types public_token as nullable (a legacy flow allowed
    // it), so guard rather than cast — a null here means nothing to exchange.
    onSuccess: (publicToken) => {
      if (publicToken) void handleSuccess(publicToken);
      else {
        setFailed(true);
        setStatus("Plaid returned no public token");
      }
    },
    onExit: (err) => {
      if (err) {
        setFailed(true);
        setStatus(err.display_message ?? err.error_message ?? "Link cancelled");
      }
    },
  });

  // Link needs the token before open() will work, so fetch on demand then open.
  const start = async () => {
    setBusy(true);
    setStatus("Preparing…");
    setFailed(false);
    try {
      const res = await fetch(`/api/plaid/link-token?products=${target.products}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not create a link token");
      setToken(body.link_token);
      setStatus(null);
    } catch (e) {
      setFailed(true);
      setStatus(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 0", borderTop: `1px solid ${T.line}` }}>
      <span>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{target.institution}</span>
        <span style={{ color: T.inkSoft, fontSize: 12, marginLeft: 8 }}>{target.blurb}</span>
        {status && (
          <div style={{ fontSize: 11.5, fontFamily: mono, color: failed ? T.loss : T.gain, marginTop: 3 }}>{status}</div>
        )}
      </span>
      <button
        onClick={start}
        disabled={busy}
        style={{
          cursor: busy ? "wait" : "pointer", background: T.ledger, color: "#fff", border: "none",
          borderRadius: 999, padding: "8px 16px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {busy ? "Working…" : "Connect"}
      </button>
    </div>
  );
}

export default function LinkPage() {
  const [linked, setLinked] = useState<{ institution: string; created_at: string }[]>([]);

  const refresh = useCallback(async () => {
    try {
      const body = await fetch("/api/plaid/exchange", { cache: "no-store" }).then((r) => r.json());
      setLinked(body.items ?? []);
    } catch {
      /* listing is informational only */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div style={{ minHeight: "100vh", background: T.paper, color: T.ink, fontFamily: sans, paddingBottom: 60 }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "34px 24px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", color: T.ledger, fontWeight: 600 }}>
            Ascendia <span style={{ color: T.inkSoft, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}>· connect accounts</span>
          </div>
          <Link href="/" style={{ fontSize: 12, color: T.inkSoft, fontFamily: mono }}>
            ← back to dashboard
          </Link>
        </div>

        <div style={{ fontFamily: serif, fontSize: 30, fontWeight: 600, marginTop: 14 }}>Connect via Plaid</div>
        <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 6, lineHeight: 1.6 }}>
          You sign in to each institution inside Plaid&apos;s own window. Your bank credentials are never sent to this
          app or stored by it — Plaid returns only an access token, which is kept server-side.
        </div>

        <Card style={{ marginTop: 20 }}>
          <Eyebrow>Institutions</Eyebrow>
          {TARGETS.map((t) => (
            <LinkButton key={t.institution} target={t} onLinked={refresh} />
          ))}
        </Card>

        <Card style={{ marginTop: 16 }}>
          <Eyebrow style={{ marginBottom: 8 }}>Already connected</Eyebrow>
          {linked.length === 0 ? (
            <div style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: mono }}>Nothing linked yet.</div>
          ) : (
            linked.map((i) => (
              <div key={i.institution} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0" }}>
                <span style={{ fontWeight: 600 }}>{i.institution}</span>
                <span style={{ fontFamily: mono, fontSize: 11.5, color: T.inkSoft }}>
                  linked {new Date(i.created_at).toLocaleDateString()}
                </span>
              </div>
            ))
          )}
          <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 10, lineHeight: 1.5 }}>
            After connecting, hit <strong>Sync now</strong> on the dashboard. Nothing is written until you approve the
            parse.
          </div>
        </Card>
      </div>
    </div>
  );
}
