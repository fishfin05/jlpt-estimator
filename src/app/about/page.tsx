import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TopNav from "@/components/TopNav";

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <TopNav email={user?.email} />
      <main className="page-results">
        <div className="results-inner">
          <h2>About</h2>

          <div className="card" style={{ borderColor: "var(--warning)" }}>
            <p style={{ fontSize: "1.05rem", color: "var(--text)", fontWeight: 600 }}>
              This should be used for practice, not learning.
            </p>
            <p className="method-note" style={{ marginTop: 8 }}>
              It estimates and tracks what you already know — it does not teach
              new kanji or vocabulary. Use it to measure progress and find weak
              spots, then study those elsewhere (and knock them off your{" "}
              <Link href="/dashboard" style={{ color: "var(--primary)" }}>
                Kill List
              </Link>
              ).
            </p>
          </div>

          <div className="card">
            <h3 className="section-label">What it does</h3>
            <p className="method-note" style={{ marginTop: 0 }}>
              You type both the <strong>meaning</strong> and the{" "}
              <strong>reading</strong> for each kanji or vocabulary word. The
              quiz samples adaptively across JLPT levels (N5–N1) and estimates,
              with confidence ranges, how many items at each level you likely
              know.
            </p>
          </div>

          <div className="card">
            <h3 className="section-label">How the estimate works</h3>
            <ul className="method-list">
              <li>
                <strong>Adaptive sampling</strong> focuses questions near your
                ability instead of wasting them on levels you&apos;ve clearly
                passed or failed.
              </li>
              <li>
                <strong>Wilson score confidence intervals (95%)</strong> turn
                your accuracy at each level into an estimated range, so a lucky
                or unlucky streak doesn&apos;t over-swing the result.
              </li>
              <li>
                Levels with fewer than ~5 questions are flagged{" "}
                <span className="low-confidence">low confidence</span> — extend
                the quiz for a tighter estimate.
              </li>
            </ul>
          </div>

          <div className="card">
            <h3 className="section-label">Data & honest caveats</h3>
            <ul className="method-list">
              <li>
                Kanji and vocabulary come from <strong>KANJIDIC2</strong> and{" "}
                <strong>JMdict</strong> (the EDRDG open dictionaries), refreshed
                from the <em>jmdict-simplified</em> project.
              </li>
              <li>
                <strong>Kanji are leveled by Japanese school grade</strong>{" "}
                (kyōiku/jōyō), which approximates the JLPT levels and covers all
                five including N1. The JLPT no longer publishes an official kanji
                list, so this is a close approximation, not gospel.
              </li>
              <li>
                <strong>Vocabulary levels are inferred</strong> from the hardest
                kanji in each word, because JMdict dropped its JLPT tags upstream
                (~2024). Treat vocab levels as approximate.
              </li>
              <li>
                Counts: ~80 / 160 / 400 / 635 / 1,110 kanji for N5→N1, and
                1,500–10,000 words per level (most-common words first).
              </li>
            </ul>
          </div>

          <div className="card">
            <h3 className="section-label">Sources & further reading</h3>
            <ul className="method-list">
              <li>
                <a href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project" target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)" }}>
                  KANJIDIC2
                </a>{" "}
                — the kanji dictionary (meanings, readings, grades). © EDRDG, licensed CC BY-SA.
              </li>
              <li>
                <a href="https://www.edrdg.org/jmdict/j_jmdict.html" target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)" }}>
                  JMdict
                </a>{" "}
                — the Japanese–English vocabulary dictionary. © EDRDG, licensed CC BY-SA.
              </li>
              <li>
                <a href="https://github.com/scriptin/jmdict-simplified" target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)" }}>
                  jmdict-simplified
                </a>{" "}
                — the JSON packaging of the two dictionaries this app downloads and refreshes from.
              </li>
              <li>
                <a href="https://en.wikipedia.org/wiki/J%C5%8Dy%C5%8D_kanji" target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)" }}>
                  Jōyō kanji
                </a>{" "}
                and{" "}
                <a href="https://en.wikipedia.org/wiki/Ky%C5%8Diku_kanji" target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)" }}>
                  kyōiku (school-grade) kanji
                </a>{" "}
                — the grade system used here to approximate JLPT kanji levels.
              </li>
              <li>
                <a href="https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval#Wilson_score_interval" target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)" }}>
                  Wilson score interval
                </a>{" "}
                — the statistics behind the estimated ranges.
              </li>
              <li>
                <a href="https://www.jlpt.jp/e/" target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)" }}>
                  Official JLPT site
                </a>{" "}
                — note it deliberately does not publish official kanji/vocabulary lists, which is why levels here are approximated.
              </li>
            </ul>
          </div>

          <div className="results-actions">
            <Link href="/" className="primary-btn" style={{ textAlign: "center" }}>
              Start a quiz
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
