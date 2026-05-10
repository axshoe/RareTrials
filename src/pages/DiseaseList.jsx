import React, { useState } from "react";
import { getAllDiseases, CATEGORIES } from "../api/diseases";

const ALL_CATS = [{ key: "all", label: "All" }, ...Object.entries(CATEGORIES).map(([key, label]) => ({ key, label }))];

export default function DiseaseList({ go }) {
  const [cat, setCat]     = useState("all");
  const [query, setQuery] = useState("");
  const all = getAllDiseases();

  const filtered = all.filter(d => {
    const matchCat = cat === "all" || d.category === cat;
    const q = query.toLowerCase();
    const matchQ = !q || d.label.toLowerCase().includes(q) || d.org?.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  return (
    <div className="page">
      <h1 style={{ fontFamily:"var(--serif)", fontSize:"1.75rem", fontWeight:700, marginBottom:"0.4rem" }}>Disease Library</h1>
      <p style={{ fontFamily:"var(--serif)", fontStyle:"italic", color:"var(--ink-2)", marginBottom:"2rem", maxWidth:600 }}>
        {all.length} rare conditions across {Object.keys(CATEGORIES).length} disease categories.
        Select any disease to view active and upcoming clinical trials.
      </p>

      <div style={{ display:"flex", gap:"0.75rem", flexWrap:"wrap", marginBottom:"1.25rem", alignItems:"center" }}>
        <input
          className="search-bar-light"
          placeholder="Search diseases or organizations..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <span className="result-count">{filtered.length} of {all.length}</span>
      </div>

      <div className="cat-tabs">
        {ALL_CATS.map(c => {
          const count = c.key === "all" ? all.length : all.filter(d => d.category === c.key).length;
          if (c.key !== "all" && !count) return null;
          return (
            <button
              key={c.key}
              className={`cat-tab${cat === c.key ? " active" : ""}`}
              onClick={() => setCat(c.key)}
            >
              {c.label} {count > 0 && <span style={{ opacity:0.6, fontSize:"0.75em" }}>({count})</span>}
            </button>
          );
        })}
      </div>

      <div className="disease-grid">
        {filtered.map(d => (
          <div key={d.id} className="disease-card" onClick={() => go("trials", { disease: d.id })}>
            <div className="dc-label">{d.label}</div>
            {d.org && <div className="dc-org">{d.org}</div>}
            <div className="dc-cat">{CATEGORIES[d.category] || d.category}</div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="empty" style={{ gridColumn:"1/-1" }}>No conditions match your search.</div>
        )}
      </div>
    </div>
  );
}
