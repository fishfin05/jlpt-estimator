"use client";

import { useEffect, useState } from "react";

/**
 * Renders a timestamp in the viewer's local timezone. Server components format
 * dates in the server's zone (UTC on Vercel), which looks wrong to the user —
 * so date display has to happen on the client.
 */
export default function LocalTime({ iso, dateOnly = false }: { iso: string; dateOnly?: boolean }) {
  const [text, setText] = useState("");

  useEffect(() => {
    const d = new Date(iso);
    setText(
      dateOnly
        ? d.toLocaleDateString()
        : d.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }),
    );
  }, [iso, dateOnly]);

  return <span suppressHydrationWarning>{text || "—"}</span>;
}
