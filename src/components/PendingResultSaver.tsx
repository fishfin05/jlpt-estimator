"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSession, type SessionPayload } from "@/lib/actions/save-session";

/**
 * If a guest took a quiz before signing in, their result was stashed in
 * localStorage. Once they're authenticated (this only renders on the protected
 * dashboard), flush it into their account and clear it.
 */
export default function PendingResultSaver() {
  const router = useRouter();
  const ran = useRef(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const raw = localStorage.getItem("pendingQuizResult");
    if (!raw) return;

    let payload: SessionPayload;
    try {
      payload = JSON.parse(raw) as SessionPayload;
    } catch {
      localStorage.removeItem("pendingQuizResult");
      return;
    }

    (async () => {
      const out = await saveSession(payload);
      if (out.ok) {
        localStorage.removeItem("pendingQuizResult");
        setMsg("✓ Saved the quiz you just took to your account.");
        router.refresh();
        setTimeout(() => setMsg(null), 6000);
      }
      // On failure, leave it in storage so it retries on the next load.
    })();
  }, [router]);

  if (!msg) return null;
  return (
    <div className="card" style={{ borderColor: "var(--success)", background: "var(--success-light)" }}>
      <p style={{ color: "var(--success)", fontSize: "0.9rem", margin: 0 }}>{msg}</p>
    </div>
  );
}
