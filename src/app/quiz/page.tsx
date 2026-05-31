import { redirect } from "next/navigation";
import { loadDictionary, dictionaryIsSeeded } from "@/lib/dictionary";
import type { Mode } from "@/lib/types";
import Quiz from "@/components/Quiz";
import Link from "next/link";

export const dynamic = "force-dynamic";

function parseMode(v: string | undefined): Mode {
  return v === "vocab" || v === "both" ? v : "kanji";
}
function parseCount(v: string | undefined): number {
  const n = parseInt(v ?? "30");
  if (Number.isNaN(n)) return 30;
  return Math.min(100, Math.max(10, n));
}

export default async function QuizPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; count?: string }>;
}) {
  const sp = await searchParams;
  const mode = parseMode(sp.mode);
  const count = parseCount(sp.count);

  if (!(await dictionaryIsSeeded())) {
    return (
      <main className="page-home">
        <div className="home-inner">
          <div className="card">
            <h2 className="section-label">Database not seeded yet</h2>
            <p className="method-note">
              The dictionary tables are empty. Run the seed script once to load the kanji and
              vocabulary data:
            </p>
            <pre className="method-note" style={{ background: "var(--bg2)", padding: 12, borderRadius: 8 }}>
              npm run seed
            </pre>
            <Link href="/" className="secondary-btn" style={{ display: "inline-block", marginTop: 12 }}>
              ← Back
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const dictionary = await loadDictionary(mode);

  return <Quiz dictionary={dictionary} mode={mode} totalQuestions={count} />;
}
