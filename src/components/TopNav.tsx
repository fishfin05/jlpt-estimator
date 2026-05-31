import Link from "next/link";

export default function TopNav({ email }: { email?: string | null }) {
  return (
    <nav className="topnav">
      <Link href="/" className="brand">
        日本語レベル測定
      </Link>
      <div className="nav-links">
        <Link href="/about">About</Link>
        {email ? (
          <>
            <Link href="/">Quiz</Link>
            <Link href="/dashboard">Dashboard</Link>
            <form action="/auth/signout" method="post" style={{ display: "inline" }}>
              <button type="submit">Sign out</button>
            </form>
          </>
        ) : (
          <Link href="/login">Sign in</Link>
        )}
      </div>
    </nav>
  );
}
