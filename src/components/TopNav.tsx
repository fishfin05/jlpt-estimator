"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNavGuard } from "./NavGuardProvider";

const LEAVE_MSG = "Leave the quiz? Your progress won't be saved.";

export default function TopNav({ email }: { email?: string | null }) {
  const router = useRouter();
  const { blockedRef } = useNavGuard();

  function go(href: string) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      if (blockedRef.current && !window.confirm(LEAVE_MSG)) return;
      router.push(href);
    };
  }

  return (
    <nav className="topnav">
      <Link href="/" className="brand" onClick={go("/")}>
        日本語レベル測定
      </Link>
      <div className="nav-links">
        <Link href="/about" onClick={go("/about")}>About</Link>
        {email ? (
          <>
            <Link href="/" onClick={go("/")}>Quiz</Link>
            <Link href="/dashboard" onClick={go("/dashboard")}>Dashboard</Link>
            <form
              action="/auth/signout"
              method="post"
              style={{ display: "inline" }}
              onSubmit={(e) => {
                if (blockedRef.current && !window.confirm(LEAVE_MSG)) e.preventDefault();
              }}
            >
              <button type="submit">Sign out</button>
            </form>
          </>
        ) : (
          <Link href="/login" onClick={go("/login")}>Sign in</Link>
        )}
      </div>
    </nav>
  );
}
