import React, { useState, useEffect } from "react";
import { getDisease, CATEGORIES } from "../api/diseases";
import { fetchTrialsForQueries, STATUS_LABEL, STATUS_EXPLAIN, STATUS_ORDER, isDimmed } from "../api/clinicaltrials";

function statusPill(s) {
  if (s === "RECRUITING")             return "pill-recruiting";
  if (s === "NOT_YET_RECRUITING")     return "pill-upcoming";
  if (s === "ENROLLING_BY_INVITATION")return "pill-invitation";
  if (s === "ACTIVE_NOT_RECRUITING")  return "pill-active";
  return "pill-neutral";
}

export default function TrialList({ disease, go }) {
  const [trials, setTrials]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [statusF, setStatusF] = useState("All");
  const [query, setQuery]     = useState("");

  const dc = disease ? getDisease(disease) : null;

  useEffect(() => {
    if (!disease || !dc) return;
    setLoading(true); setError(""); setTrials([]);
    fetchTrialsForQueries(dc.queries)
      .then(data => setTrials(data))
      .catch(() => setError("Failed to load trials. Please check your connection."))
      .finally(() => setLoading(false));
  }, [disease]);

  const STATUS_OPTIONS = ["All","RECRUITING","NOT_YET_RECRUITING","ENROLLING_BY_INVITATION","ACTIVE_NOT_RECRUITING","COMPLETED"];

  const filtered = trials.filter(t => {
    const sm = statusF === "All" || t.status === statusF;
    const q  = query.toLowerCase();
    const qm = !q || t.briefTitle?.toLowerCase().includes(q) || t.nctId?.toLowerCase().includes(q);
    return sm && qm;
  });

  if (!disease) return (
    <div className="page">
      <p style={{ fontFamily:"var(--serif)", fontStyle:"italic", color:"var(--ink-2)" }}>
        Select a disease from the <button className="btn-link" onClick={() => go("diseases")}>disease library</button> to view trials.
      </p>
    </div>
  );

  return (
    <div className="page">
      <button className="btn-back" onClick={() => go("diseases")}>← Disease library</button>

      {dc && (
        <div style={{ marginTop:"0.875rem", marginBottom:"1.75rem" }}>
          <h1 style={{ fontFamily:"var(--serif)", fontSize:"1.6rem", fontWeight:700, marginBottom:"0.375rem" }}>{dc.label}</h1>
          <p style={{ fontFamily:"var(--serif)", fontStyle:"italic", color:"var(--ink-2)", fontSize:"0.9375rem", maxWidth:600, lineHeight:1.65 }}>
            {dc.org
              ? <><a href={dc.orgUrl} target="_blank" rel="noreferrer">{dc.org}</a> &nbsp;·&nbsp; </>
              : null
            }
            {CATEGORIES[dc.category] || dc.category}
          </p>
        </div>
      )}

      {dc?.trialNote && <div className="trial-note">{dc.trialNote}</div>}

      <div className="filters">
        <input
          className="search-bar-light"
          style={{ width:240 }}
          placeholder="Search trials..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <select className="filter-select" value={statusF} onChange={e => setStatusF(e.target.value)}>
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s === "All" ? "All statuses" : STATUS_LABEL[s] || s}</option>
          ))}
        </select>
        <span className="result-count">
          {loading ? "Loading..." : `${filtered.length} trial${filtered.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {error && <div className="error-msg">{error}</div>}
      {loading && <div className="loading">Loading from ClinicalTrials.gov...</div>}

      {!loading && !error && (
        <>
          <div className="status-legend">
            <strong style={{ color:"var(--ink-2)" }}>Status:</strong>
            <span className="legend-item"><span className="legend-dot" style={{ background:"var(--green)" }}/>Enrolling now</span>
            <span className="legend-item"><span className="legend-dot" style={{ background:"var(--amber)" }}/>Opening soon</span>
            <span className="legend-item"><span className="legend-dot" style={{ background:"var(--teal)" }}/>Active, enrollment closed</span>
            <span className="legend-item"><span className="legend-dot" style={{ background:"var(--ink-3)" }}/>Completed / terminated</span>
          </div>
          <div className="trial-list">
            {filtered.length === 0 && <div className="empty">No trials match the current filters.</div>}
            {filtered.map(t => (
              <div
                key={t.nctId}
                className={`trial-row${isDimmed(t.status) ? " dimmed" : ""}`}
                onClick={() => go("detail", { trial: t.nctId, disease })}
              >
                <div>
                  <div className="tr-title">{t.briefTitle || t.title}</div>
                  <div className="tr-meta">
                    <span className="tr-nct">{t.nctId}</span>
                    {t.phase && <span>{t.phase}</span>}
                    <span>{t.locations?.length || 0} site{t.locations?.length !== 1 ? "s" : ""}</span>
                    {t.minAge && <span>Age {t.minAge}+</span>}
                    {STATUS_EXPLAIN[t.status] && <span className="tr-explain">{STATUS_EXPLAIN[t.status]}</span>}
                  </div>
                </div>
                <div className="tr-right">
                  <span className={`pill ${statusPill(t.status)}`}>{STATUS_LABEL[t.status] || t.status?.replace(/_/g," ")}</span>
                  <a
                    href={`https://clinicaltrials.gov/study/${t.nctId}`}
                    target="_blank" rel="noreferrer"
                    className="ctgov-link"
                    onClick={e => e.stopPropagation()}
                  >ClinicalTrials.gov ↗</a>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
