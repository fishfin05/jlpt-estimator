"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const authError = params.get("error");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(authError ? "error" : "idle");
  const [message, setMessage] = useState(
    authError ? `${decodeURIComponent(authError)} — request a fresh link below (each link works only once).` : "",
  );

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    const supabase = createClient();
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (typeof window !== "undefined" ? window.location.origin : "");

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
      setMessage("Check your email for a sign-in link. You can close this tab after clicking it.");
    }
  }

  return (
    <div className="page-home">
      <div className="auth-card">
        <div className="logo-area">
          <h1>日本語レベル測定</h1>
          <p className="tagline">Sign in to track your progress</p>
        </div>

        <form onSubmit={sendLink} className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <button className="primary-btn" type="submit" disabled={status === "sending"}>
            {status === "sending" ? "Sending…" : "Send magic link"}
          </button>
          {message && (
            <div className={`auth-msg ${status === "error" ? "error" : "success"}`}>{message}</div>
          )}
        </form>

        <p className="slider-hint" style={{ textAlign: "center" }}>
          No password needed — we email you a one-click sign-in link.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="page-home" />}>
      <LoginForm />
    </Suspense>
  );
}
