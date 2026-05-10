import React, { useState } from "react";
import { getAllDiseases, searchDiseases, CATEGORIES } from "../api/diseases";

export default function Home({ go }) {
  const [query, setQuery] = useState("");
  const [open, setOpen]   = useState(false);
  const all = getAllDiseases();

  const results = query.length > 1 ? searchDiseases(query).slice(0, 9) : [];

  function pick(d) {
    setQuery(""); setOpen(false);
    go("trials", { disease: d.id });
  }

  return (
    <>
      <div className="hero">
        <div className="hero-inner">
          <div className="hero-kicker">Open source · free · no account required</div>
          <h1>Clinical trials for<br /><em>every</em> rare disease</h1>
          <p className="hero-lead">
            Search {all.length}+ rare conditions across all disease categories.
            Trials sorted by urgency. Eligibility in plain language. Sites mapped to you.
          </p>

          <div className="hero-stats">
            <div>
              <div className="hero-stat-num">{all.length}+</div>
              <div className="hero-stat-lbl">Diseases covered</div>
            </div>
            <div>
              <div className="hero-stat-num">10,000+</div>
              <div className="hero-stat-lbl">Rare diseases exist</div>
            </div>
            <div>
              <div className="hero-stat-num">95%</div>
              <div className="hero-stat-lbl">Have no approved treatment</div>
            </div>
            <div>
              <div className="hero-stat-num">Auto</div>
              <div className="hero-stat-lbl">Updated daily</div>
            </div>
          </div>

          <div className="search-wrap">
            <span className="search-icon">⌕</span>
            <input
              className="search-input"
              placeholder="Search by disease, gene, condition name, or organization..."
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 160)}
              autoComplete="off"
            />
            {open && results.length > 0 && (
              <div className="dropdown">
                {results.map(d => (
                  <div key={d.id} className="dropdown-item" onMouseDown={() => pick(d)}>
                    <span className="dropdown-item-label">{d.label}</span>
                    <span className="dropdown-item-org">{d.org || "Independent research"}</span>
                    <span className="dropdown-item-cat">{CATEGORIES[d.category] || d.category}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="hero-btns">
            <button className="btn btn-white" onClick={() => go("diseases")}>Browse all diseases</button>
            <button className="btn btn-outline-white" onClick={() => go("check")}>Check my eligibility</button>
          </div>
        </div>
      </div>

      <div className="page">

        <div className="section-label">How RareTrials works</div>
        <div className="how-grid">
          {[
            ["01", "Sorted by urgency",  "Opening-soon and enrolling trials appear at the top. Completed and terminated trials sit at the bottom, visually muted. You see what's actually available without scrolling past closed studies."],
            ["02", "Plain language",     "Eligibility criteria are written in regulatory language for reviewers, not patients. RareTrials translates each criterion into terms a family can understand and act on."],
            ["03", "Sites near you",     "Enter your zip code to rank trial sites by driving distance using Haversine distance computed from scratch. A map shows all sites simultaneously. Contact emails displayed directly where available."],
            ["04", "Any rare disease",   "Search any condition by name, gene symbol, synonym, or advocacy organization. If ClinicalTrials.gov has studies for it, RareTrials will surface them, with a clear note when none exist yet."],
          ].map(([n, t, p]) => (
            <div key={n} className="how-cell">
              <div className="how-num">{n}</div>
              <h3>{t}</h3>
              <p>{p}</p>
            </div>
          ))}
        </div>

        <div className="section-label">For patient advocacy organizations</div>
        <div style={{ background: "var(--white)", border: "1px solid var(--rule)", borderRadius: "var(--rl)", padding: "1.5rem 1.75rem", boxShadow: "var(--shadow)", marginBottom: "2.5rem" }}>
          <p style={{ fontFamily: "var(--serif)", fontSize: "0.9375rem", color: "var(--ink-2)", marginBottom: "1rem", lineHeight: 1.7 }}>
            Embed a disease-specific trial finder on your organization's website with one line of HTML.
            The tool updates automatically every week. No maintenance required from your team.
            Replace the disease ID with any condition in the library.
          </p>
          <div className="code-block">
            {`<iframe src="https://raretrials.vercel.app?embed=1&disease=angelman" width="100%" height="700" frameborder="0"></iframe>`}
          </div>
          <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: "0.84rem", color: "var(--ink-3)", marginTop: "0.75rem" }}>
            Full disease ID list in the{" "}
            <a href="https://github.com/axshoe/raretrials" target="_blank" rel="noreferrer">GitHub README</a>.
            Open source. Free forever.
          </p>
        </div>

        <div className="section-label">Disease categories</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: "1px", background: "var(--rule)", border: "1px solid var(--rule)", borderRadius: "var(--rl)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
          {Object.entries(CATEGORIES).map(([key, label]) => {
            const count = all.filter(d => d.category === key).length;
            if (!count) return null;
            return (
              <div
                key={key}
                style={{ background: "var(--white)", padding: "14px 18px", cursor: "pointer" }}
                onClick={() => go("diseases")}
              >
                <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: 3 }}>{label}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--ink-3)" }}>{count} condition{count !== 1 ? "s" : ""}</div>
              </div>
            );
          })}
        </div>

      </div>
    </>
  );
}
