import React, { useState } from "react";
import Home from "./pages/Home";
import DiseaseList from "./pages/DiseaseList";
import TrialList from "./pages/TrialList";
import TrialDetail from "./pages/TrialDetail";
import EligibilityChecker from "./pages/EligibilityChecker";
import "./index.css";

function getParams() {
  const p = new URLSearchParams(window.location.search);
  return { embed: p.get("embed") === "1", disease: p.get("disease") || null };
}

export default function App() {
  const { embed, disease: embedDisease } = getParams();
  const [page, setPage]         = useState(embedDisease ? "trials" : "home");
  const [disease, setDisease]   = useState(embedDisease || null);
  const [trial, setTrial]       = useState(null);

  function go(dest, opts = {}) {
    if (opts.disease !== undefined) setDisease(opts.disease);
    if (opts.trial   !== undefined) setTrial(opts.trial);
    setPage(dest);
    window.scrollTo(0, 0);
  }

  return (
    <div className={`app${embed ? " widget" : ""}`}>
      {!embed && (
        <nav className="nav">
          <div className="nav-inner">
            <div className="nav-brand" onClick={() => go("home")}>
              Rare<em>Trials</em>
            </div>
            <div className="nav-links">
              <button className={`nav-btn${page==="home" ? " active":""}`}     onClick={() => go("home")}>Home</button>
              <button className={`nav-btn${page==="diseases" ? " active":""}`} onClick={() => go("diseases")}>Diseases</button>
              <button className={`nav-btn${page==="check" ? " active":""}`}    onClick={() => go("check")}>Check Eligibility</button>
            </div>
            <div className="nav-end">
              <a href="https://thexiulab.org" target="_blank" rel="noreferrer">A Xiu Lab project</a>
            </div>
          </div>
        </nav>
      )}

      <main>
        {page === "home"     && <Home go={go} />}
        {page === "diseases" && <DiseaseList go={go} />}
        {page === "trials"   && <TrialList disease={disease} go={go} />}
        {page === "detail"   && <TrialDetail nctId={trial} disease={disease} go={go} />}
        {page === "check"    && <EligibilityChecker disease={disease} go={go} />}
      </main>

      {!embed && (
        <footer className="footer">
          <div className="footer-inner">
            <div>
              <div style={{ fontFamily:"var(--serif)", fontSize:"0.9rem", color:"rgba(255,255,255,0.7)", marginBottom:"0.5rem" }}>
                <em>RareTrials</em> — a Xiu Lab project
              </div>
              <p>Open source at <a href="https://github.com/axshoe/raretrials" target="_blank" rel="noreferrer">github.com/axshoe/raretrials</a></p>
            </div>
            <div style={{ textAlign:"right" }}>
              <p>Data from <a href="https://clinicaltrials.gov" target="_blank" rel="noreferrer">ClinicalTrials.gov</a></p>
              <p style={{ marginTop:"4px" }}>For informational use only. Contact trial coordinators to confirm eligibility.</p>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
