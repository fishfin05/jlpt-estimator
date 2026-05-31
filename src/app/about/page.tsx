import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="page-results">
      <div className="results-inner">
        <h2>About</h2>

        <div className="card" style={{ borderColor: "var(--warning)" }}>
          <p style={{ fontSize: "1.05rem", color: "var(--text)", fontWeight: 600 }}>
            This is for practice, not learning.
          </p>
          <p className="method-note" style={{ marginTop: 8 }}>
            It estimates and tracks what you already know — it doesn&apos;t teach
            new kanji or vocabulary. Use it to measure where you are and find
            weak spots, then go study those elsewhere.
          </p>
        </div>

        <div className="card">
          <h3 className="section-label">What it does</h3>
          <p className="method-note" style={{ marginTop: 0 }}>
            You type the meaning and the reading for each kanji or word. The quiz
            samples adaptively across JLPT levels (N5–N1) and estimates how many
            items at each level you likely know, with confidence ranges.
          </p>
        </div>

        <div className="card">
          <h3 className="section-label">How the estimate works</h3>
          <ul className="method-list">
            <li>
              It focuses questions near your ability instead of wasting them on
              levels you&apos;ve clearly passed or failed.
            </li>
            <li>
              It uses Wilson score confidence intervals to turn your accuracy at
              each level into a range, so a lucky or unlucky streak doesn&apos;t
              swing the result too far.
            </li>
            <li>
              Levels with fewer than about five questions are flagged{" "}
              <span className="low-confidence">low confidence</span> — extend the
              quiz for a tighter estimate.
            </li>
          </ul>
        </div>

        <div className="card">
          <h3 className="section-label">Data &amp; caveats</h3>
          <ul className="method-list">
            <li>
              Kanji and vocabulary come from the open KANJIDIC2 and JMdict
              dictionaries (EDRDG).
            </li>
            <li>
              Kanji levels are approximated from Japanese school grade, since the
              JLPT no longer publishes an official kanji list. It&apos;s a close
              approximation, not an official mapping.
            </li>
            <li>
              Vocabulary levels are inferred from the hardest kanji in each word,
              because JMdict dropped its JLPT tags around 2024. Treat vocab
              levels as approximate.
            </li>
            <li>
              Roughly 80 / 160 / 400 / 635 / 1,110 kanji for N5 through N1, and
              1,500–10,000 words per level (most common words first).
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
  );
}
