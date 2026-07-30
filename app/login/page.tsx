"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { T, mono, serif, sans } from "@/lib/theme";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { SIGNUPS_ENABLED } from "@/lib/auth-config";

type Mode = "signin" | "signup";

const inputStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 14,
  padding: "10px 12px",
  border: `1px solid ${T.line}`,
  borderRadius: 8,
  width: "100%",
  background: T.card,
  color: T.ink,
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/");
      router.refresh();
      return;
    }

    if (!SIGNUPS_ENABLED) {
      setLoading(false);
      setError("Sign-ups are closed.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      router.push("/");
      router.refresh();
      return;
    }
    setNotice("Check your email to confirm your account, then sign in.");
  };

  return (
    <div style={{ minHeight: "100vh", background: T.paper, color: T.ink, fontFamily: sans, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed local asset, not worth next/image's overhead for a 32px mark */}
          <img src="/logo.png" alt="" width={32} height={32} style={{ display: "block", margin: "0 auto 10px" }} />
          <div style={{ fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", color: T.ledger, fontWeight: 600 }}>
            Ascendia
          </div>
          <div style={{ fontFamily: serif, fontSize: 30, fontWeight: 600, marginTop: 10 }}>
            {mode === "signin" ? "Sign in" : "Create account"}
          </div>
        </div>

        <Card>
          {SIGNUPS_ENABLED && (
            <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${T.line}` }}>
              {(
                [
                  ["signin", "Sign in"],
                  ["signup", "Create account"],
                ] as [Mode, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setMode(id);
                    setError(null);
                    setNotice(null);
                  }}
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: "8px 4px 12px", marginRight: 16, fontFamily: "inherit",
                    fontSize: 13.5, fontWeight: mode === id ? 600 : 400, color: mode === id ? T.ink : T.inkSoft,
                    borderBottom: mode === id ? `2px solid ${T.ledger}` : "2px solid transparent", marginBottom: -1,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <label style={{ display: "block", marginBottom: 14 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: T.inkSoft, marginBottom: 6 }}>Email</div>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ display: "block", marginBottom: 18 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: T.inkSoft, marginBottom: 6 }}>Password</div>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
            </label>

            {error && <div style={{ fontSize: 12.5, color: T.loss, fontFamily: mono, marginBottom: 14 }}>{error}</div>}
            {notice && <div style={{ fontSize: 12.5, color: T.gain, fontFamily: mono, marginBottom: 14 }}>{notice}</div>}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", cursor: loading ? "wait" : "pointer", background: T.ledger, color: "#fff",
                border: "none", borderRadius: 8, padding: "11px 0", fontFamily: "inherit", fontSize: 14, fontWeight: 600,
              }}
            >
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        </Card>

        <div style={{ textAlign: "center", marginTop: 18 }}>
          <Link href="/demo" style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: mono, textDecoration: "none" }}>
            View demo →
          </Link>
        </div>
      </div>
    </div>
  );
}
