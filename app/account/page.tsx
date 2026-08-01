"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { T, mono, serif, sans } from "@/lib/theme";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

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

const labelCaption: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: T.inkSoft,
  marginBottom: 6,
};

const buttonStyle: React.CSSProperties = {
  cursor: "pointer",
  background: T.gain,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 18px",
  fontFamily: "inherit",
  fontSize: 13.5,
  fontWeight: 600,
};

export default function AccountPage() {
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setCurrentEmail(data.user?.email ?? null));
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: T.paper, color: T.ink, fontFamily: sans, paddingBottom: 60 }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "34px 24px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ fontFamily: serif, fontSize: 26, fontWeight: 600 }}>Account</div>
          <Link href="/" style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: mono, textDecoration: "none" }}>
            ← Back to dashboard
          </Link>
        </div>

        {currentEmail && (
          <div style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: mono, marginBottom: 20 }}>
            Signed in as {currentEmail}
          </div>
        )}

        <EmailForm />
        <div style={{ height: 16 }} />
        <PasswordForm />
      </div>
    </div>
  );
}

function EmailForm() {
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    const supabase = createClient();

    const { data: userData } = await supabase.auth.getUser();
    const currentUserEmail = userData.user?.email;
    if (!currentUserEmail) {
      setLoading(false);
      setError("Not signed in.");
      return;
    }

    // Re-verify the current password before allowing an email change — the
    // session alone shouldn't be enough for a sensitive account change.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: currentUserEmail,
      password: currentPassword,
    });
    if (verifyError) {
      setLoading(false);
      setError("Current password is incorrect.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ email });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setEmail("");
    setCurrentPassword("");
    setNotice(
      `Confirmation links sent to ${currentUserEmail} and ${email} — the change only takes effect once you confirm. If BASIS_OWNER_EMAIL is set on the deployment, update it to match before confirming, or the new email will be locked out.`
    );
  };

  return (
    <Card>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Change email</div>
      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginBottom: 14 }}>
          <div style={labelCaption}>New email</div>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: "block", marginBottom: 16 }}>
          <div style={labelCaption}>Current password</div>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            style={inputStyle}
          />
        </label>
        {error && <div style={{ fontSize: 12.5, color: T.loss, fontFamily: mono, marginBottom: 14 }}>{error}</div>}
        {notice && <div style={{ fontSize: 12.5, color: T.gain, fontFamily: mono, marginBottom: 14, lineHeight: 1.5 }}>{notice}</div>}
        <button type="submit" disabled={loading} style={{ ...buttonStyle, cursor: loading ? "wait" : "pointer" }}>
          {loading ? "Please wait…" : "Update email"}
        </button>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (newPassword !== confirmPassword) {
      setError("New passwords don't match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { data: userData } = await supabase.auth.getUser();
    const currentUserEmail = userData.user?.email;
    if (!currentUserEmail) {
      setLoading(false);
      setError("Not signed in.");
      return;
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: currentUserEmail,
      password: currentPassword,
    });
    if (verifyError) {
      setLoading(false);
      setError("Current password is incorrect.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setNotice("Password updated.");
  };

  return (
    <Card>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Change password</div>
      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginBottom: 14 }}>
          <div style={labelCaption}>Current password</div>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "block", marginBottom: 14 }}>
          <div style={labelCaption}>New password</div>
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "block", marginBottom: 16 }}>
          <div style={labelCaption}>Confirm new password</div>
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={inputStyle}
          />
        </label>
        {error && <div style={{ fontSize: 12.5, color: T.loss, fontFamily: mono, marginBottom: 14 }}>{error}</div>}
        {notice && <div style={{ fontSize: 12.5, color: T.gain, fontFamily: mono, marginBottom: 14 }}>{notice}</div>}
        <button type="submit" disabled={loading} style={{ ...buttonStyle, cursor: loading ? "wait" : "pointer" }}>
          {loading ? "Please wait…" : "Update password"}
        </button>
      </form>
    </Card>
  );
}
