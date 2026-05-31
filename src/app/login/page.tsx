"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { signUpAction } from "@/lib/actions/auth";

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const authError = params.get("error");

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "error" | "info">(
    authError ? "error" : "idle",
  );
  const [message, setMessage] = useState(
    authError ? decodeURIComponent(authError) : "",
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setStatus("working");
    setMessage("");
    if (mode === "signin") {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setStatus("error");
        setMessage(error.message);
      } else {
        // Full navigation so the server picks up the new session cookie.
        window.location.assign(next);
      }
    } else {
      // Sign-up creates an already-confirmed account server-side and signs in
      // immediately — no confirmation email needed.
      const result = await signUpAction(email.trim(), password);
      if (!result.ok) {
        setStatus("error");
        setMessage(result.error);
      } else {
        // The session cookie was set on the server; reload so it's picked up.
        window.location.assign(next);
      }
    }
  }

  return (
    <div className="page-home">
      <div className="auth-card">
        <div className="logo-area">
          <h1>日本語レベル測定</h1>
          <p className="tagline">
            {mode === "signin" ? "Sign in to track your progress" : "Create an account"}
          </p>
        </div>

        <form onSubmit={submit} className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            type="password"
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={6}
            required
          />
          <button className="primary-btn" type="submit" disabled={status === "working"}>
            {status === "working"
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
          {message && (
            <div className={`auth-msg ${status === "error" ? "error" : "success"}`}>{message}</div>
          )}
        </form>

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "signin" ? "signup" : "signin"));
            setStatus("idle");
            setMessage("");
          }}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: "0.85rem",
            fontFamily: "inherit",
          }}
        >
          {mode === "signin"
            ? "No account? Create one →"
            : "← Already have an account? Sign in"}
        </button>
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
