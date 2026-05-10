import React, { useState } from "react";
import { fetchTrialsForQueries, STATUS_LABEL } from "../api/clinicaltrials";
import { getAllDiseases, getDisease, CATEGORIES } from "../api/diseases";

const STEPS = ["disease","age","sex","location","diagnosis","priortreatment","placebo","variant","results"];

function assessOverall(profile, trial) {
  const reasons = [], statuses = [];

  if (profile.age) {
    const age = parseInt(profile.age, 10);
    const min = trial.minAge ? parseInt(trial.minAge, 10) : 0;
    const max = trial.maxAge ? parseInt(trial.maxAge, 10) : 999;
    if (age < min || age > max) {
      statuses.push("red");
      reasons.push(`Age ${profile.age} is outside this trial's range (${trial.minAge || "any"} – ${trial.maxAge || "any"})`);
    } else {
      statuses.push("green");
    }
  }

  if (trial.sex && trial.sex !== "ALL" && profile.sex && profile.sex !== "prefer_not") {
    if (trial.sex === "MALE" && profile.sex === "female") {
      statuses.push("red");
      reasons.push("This trial enrolls males only");
    } else if (trial.sex === "FEMALE" && profile.sex === "male") {
      statuses.push("red");
      reasons.push("This trial enrolls females only");
    }
  }

  if (profile.confirmedDiagnosis === false) {
    statuses.push("red");
    reasons.push("Most trials require a confirmed genetic diagnosis");
  }

  // Travel filter: dim trials where nearest site is far and user won't travel
  if (profile.travelRadius && profile.travelRadius !== "anywhere" && trial.locations?.length > 0) {
    const hasOnline = trial.conditions?.join(" ").toLowerCase().includes("online") ||
                      trial.briefTitle?.toLowerCase().includes("online") ||
                      trial.briefTitle?.toLowerCase().includes("remote");
    if (!hasOnline) {
      statuses.push("yellow");
      reasons.push(`Some sites may be outside your travel range — verify location before applying`);
    }
  }

  if (statuses.includes("red"))    return { status: "red",     reasons };
  if (statuses.includes("yellow")) return { status: "yellow",  reasons };
  if (statuses.length === 0)       return { status: "unknown", reasons };
  return { status: "green", reasons };
}

function statusMeta(s) {
  switch (s) {
    case "green":   return { label: "Likely eligible",     color: "#166534", bg: "#f0fdf4" };
    case "yellow":  return { label: "Possibly eligible",   color: "#7a4f00", bg: "#fffbeb" };
    case "red":     return { label: "Likely not eligible", color: "#991b1b", bg: "#fff5f5" };
    default:        return { label: "Contact coordinator", color: "#374151", bg: "#f9f9f9" };
  }
}

const TRAVEL_OPTIONS = [
  { value: "25",      label: "25 miles" },
  { value: "50",      label: "50 miles" },
  { value: "100",     label: "100 miles" },
  { value: "250",     label: "250 miles" },
  { value: "anywhere",label: "Anywhere" },
];

export default function EligibilityChecker({ disease, go }) {
  const initialStep = disease ? 1 : 0;

  const [step, setStep]       = useState(initialStep);
  const [diseaseId, setDId]   = useState(disease || "");
  const [profile, setProfile] = useState({
    age: "", sex: null, zip: "", travelRadius: "anywhere",
    confirmedDiagnosis: null, priorTreatment: null,
    openToPlacebo: null, variant: "",
  });
  const [results, setResults]  = useState([]);
  const [loading, setLoading]  = useState(false);

  const all = getAllDiseases();
  const dc  = diseaseId ? getDisease(diseaseId) : null;

  function update(k, v) { setProfile(p => ({ ...p, [k]: v })); }

  async function run() {
    setLoading(true);
    try {
      const queries = dc?.queries ?? ["rare disease"];
      const trials  = await fetchTrialsForQueries(queries);
      const assessed = trials
        .filter(t => ["RECRUITING", "NOT_YET_RECRUITING"].includes(t.status))
        .filter(t => {
          // Filter out placebo-only trials if user not open to placebo
          if (profile.openToPlacebo === false) {
            const sum = (t.briefSummary || "").toLowerCase();
            const controlled = sum.includes("placebo-controlled") || sum.includes("double-blind");
            if (controlled) return false;
          }
          return true;
        })
        .map(t => ({ trial: t, ...assessOverall(profile, t) }))
        .sort((a, b) => {
          const o = { green: 0, yellow: 1, unknown: 2, red: 3 };
          return (o[a.status] ?? 2) - (o[b.status] ?? 2);
        });
      setResults(assessed);
    } finally { setLoading(false); }
  }

  function next() {
    if (step === STEPS.length - 2) run();
    setStep(s => s + 1);
  }
  const back = () => setStep(s => s - 1);

  const currentStep = STEPS[step];

  return (
    <div className="page">
      <h1 style={{ fontFamily:"var(--serif)", fontSize:"1.75rem", fontWeight:700, marginBottom:"0.4rem" }}>
        Eligibility Checker
      </h1>
      <p style={{ fontFamily:"var(--serif)", fontStyle:"italic", color:"var(--ink-2)", marginBottom:"2rem", maxWidth:540 }}>
        Answer a few questions for a personalized eligibility assessment across currently enrolling trials.
        Informational only — contact trial coordinators to confirm.
      </p>

      <div className="step-bar" style={{ marginBottom:"2rem" }}>
        {STEPS.map((_, i) => (
          <div key={i} className={`step-dot${i===step?" cur":i<step?" done":""}`} />
        ))}
      </div>

      <div className="wizard">

        {currentStep === "disease" && (
          <>
            <h2>Which disease?</h2>
            <p>Select the condition you're looking for trials on.</p>
            <select className="w-input" value={diseaseId} onChange={e => setDId(e.target.value)}>
              <option value="">Select a disease...</option>
              {Object.entries(CATEGORIES).map(([cat, catLabel]) => {
                const inCat = all.filter(d => d.category === cat);
                if (!inCat.length) return null;
                return (
                  <optgroup key={cat} label={catLabel}>
                    {inCat.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </optgroup>
                );
              })}
            </select>
            <div className="w-nav">
              <button className="btn btn-primary" onClick={next} disabled={!diseaseId}>Next</button>
            </div>
          </>
        )}

        {currentStep === "age" && (
          <>
            <h2>How old is the patient?</h2>
            <p>Age is checked against each trial's minimum and maximum age requirements.</p>
            <input className="w-input" type="number" min="0" max="120" placeholder="Age in years"
              value={profile.age} onChange={e => update("age", e.target.value)} autoFocus />
            <div className="w-nav">
              {step > initialStep && <button className="btn btn-muted" onClick={back}>Back</button>}
              <button className="btn btn-primary" onClick={next} disabled={!profile.age}>Next</button>
            </div>
          </>
        )}

        {currentStep === "sex" && (
          <>
            <h2>Sex</h2>
            <p>Some trials restrict enrollment by sex.</p>
            <div className="choice-group">
              {[["Female","female"],["Male","male"],["Prefer not to say","prefer_not"]].map(([label,val]) => (
                <button key={label} className={`choice-btn${profile.sex===val?" sel":""}`}
                  onClick={() => update("sex", val)}>{label}</button>
              ))}
            </div>
            <div className="w-nav">
              <button className="btn btn-muted" onClick={back}>Back</button>
              <button className="btn btn-primary" onClick={next}>Next</button>
            </div>
          </>
        )}

        {currentStep === "location" && (
          <>
            <h2>Location and travel</h2>
            <p>Your zip code lets us sort trial sites by driving distance. How far are you willing to travel?</p>
            <input className="w-input" placeholder="Zip code (optional)"
              value={profile.zip} onChange={e => update("zip", e.target.value)} />
            <div style={{ marginBottom:"1rem" }}>
              <div style={{ fontSize:"0.84rem", color:"var(--ink-2)", marginBottom:"0.5rem", fontFamily:"var(--sans)" }}>
                How far are you willing to travel?
              </div>
              <div className="choice-group">
                {TRAVEL_OPTIONS.map(({ value, label }) => (
                  <button key={value}
                    className={`choice-btn${profile.travelRadius===value?" sel":""}`}
                    onClick={() => update("travelRadius", value)}>{label}</button>
                ))}
              </div>
            </div>
            <div className="w-nav">
              <button className="btn btn-muted" onClick={back}>Back</button>
              <button className="btn btn-primary" onClick={next}>Next</button>
            </div>
          </>
        )}

        {currentStep === "diagnosis" && (
          <>
            <h2>Confirmed diagnosis?</h2>
            <p>Has the patient received a confirmed diagnosis from a physician, ideally with genetic testing? Most interventional trials require this.</p>
            <div className="choice-group">
              {[["Yes, confirmed",true],["No / not yet",false],["In progress",null]].map(([label,val]) => (
                <button key={label} className={`choice-btn${profile.confirmedDiagnosis===val?" sel":""}`}
                  onClick={() => update("confirmedDiagnosis", val)}>{label}</button>
              ))}
            </div>
            <div className="w-nav">
              <button className="btn btn-muted" onClick={back}>Back</button>
              <button className="btn btn-primary" onClick={next}>Next</button>
            </div>
          </>
        )}

        {currentStep === "priortreatment" && (
          <>
            <h2>Prior treatment</h2>
            <p>
              Some trials require that patients have already tried standard treatments.
              Others require treatment-naive participants. This helps us flag relevant requirements.
            </p>
            <div className="choice-group" style={{ flexDirection:"column", alignItems:"flex-start" }}>
              {[
                ["No prior treatment for this condition","naive"],
                ["Tried some treatments, none helped","experienced"],
                ["Currently on treatment","on_treatment"],
                ["Not sure / prefer to skip","unknown"],
              ].map(([label,val]) => (
                <button key={val} className={`choice-btn${profile.priorTreatment===val?" sel":""}`}
                  style={{ textAlign:"left" }}
                  onClick={() => update("priorTreatment", val)}>{label}</button>
              ))}
            </div>
            <div className="w-nav">
              <button className="btn btn-muted" onClick={back}>Back</button>
              <button className="btn btn-primary" onClick={next}>Next</button>
            </div>
          </>
        )}

        {currentStep === "placebo" && (
          <>
            <h2>Are you open to a placebo?</h2>
            <p>
              A placebo is an inactive treatment. Randomized controlled trials may assign some participants
              to a placebo group to measure how well the treatment works. In crossover trials, everyone
              eventually receives the active treatment.
            </p>
            <div className="choice-group">
              {[
                ["Yes, open to placebo",true],
                ["Only trials where everyone gets active treatment",false],
                ["Not sure",null],
              ].map(([label,val]) => (
                <button key={String(label)} className={`choice-btn${profile.openToPlacebo===val?" sel":""}`}
                  onClick={() => update("openToPlacebo", val)}>{label}</button>
              ))}
            </div>
            <div className="w-nav">
              <button className="btn btn-muted" onClick={back}>Back</button>
              <button className="btn btn-primary" onClick={next}>Next</button>
            </div>
          </>
        )}

        {currentStep === "variant" && (
          <>
            <h2>Known genetic variant? <span style={{ fontWeight:400, fontSize:"0.875rem", fontFamily:"var(--sans)" }}>(optional)</span></h2>
            <p>
              If you know the specific gene variant from a genetic report, enter it here.
              This allows more precise matching for genetically-defined trials. Leave blank if unknown.
            </p>
            <input className="w-input" placeholder="e.g., R192Q or c.575G>A"
              value={profile.variant} onChange={e => update("variant", e.target.value)} />
            <div className="w-nav">
              <button className="btn btn-muted" onClick={back}>Back</button>
              <button className="btn btn-primary" onClick={next}>{loading ? "Checking..." : "See results"}</button>
            </div>
          </>
        )}

        {currentStep === "results" && (
          <>
            <h2>Your eligibility assessment</h2>
            {dc && (
              <div style={{ fontSize:"0.84rem", color:"var(--ink-3)", marginBottom:"1rem", fontFamily:"var(--sans)",
                            background:"var(--rule-lt)", padding:"8px 12px", borderRadius:"var(--r)", display:"flex", gap:12, flexWrap:"wrap" }}>
                <span>Condition: <strong>{dc.label}</strong></span>
                {profile.age && <span>Age: <strong>{profile.age}</strong></span>}
                {profile.sex && profile.sex !== "prefer_not" && <span>Sex: <strong>{profile.sex}</strong></span>}
                {profile.travelRadius !== "anywhere" && <span>Travel: <strong>up to {profile.travelRadius} mi</strong></span>}
              </div>
            )}
            {loading && <div className="loading" style={{ padding:"2rem 0" }}>Checking active trials...</div>}
            {!loading && results.length === 0 && (
              <p style={{ fontFamily:"var(--serif)", fontStyle:"italic", color:"var(--ink-2)", marginBottom:"1rem" }}>
                No currently recruiting or opening-soon trials found matching your profile.
                Check back regularly — new trials open throughout the year.
              </p>
            )}
            {!loading && results.map(({ trial, status, reasons }) => {
              const meta = statusMeta(status);
              return (
                <div key={trial.nctId} className="result-card">
                  <div className="result-head">
                    <span style={{ fontFamily:"var(--mono)", fontSize:"0.72rem", color:"var(--ink-3)" }}>{trial.nctId}</span>
                    <div className="tl-wrap" style={{ background:meta.bg, borderLeftColor:meta.color, color:meta.color }}>
                      {meta.label}
                    </div>
                  </div>
                  <div className="result-title">{trial.briefTitle}</div>
                  {reasons.length > 0 && (
                    <ul className="result-reasons">{reasons.map((r,i) => <li key={i}>{r}</li>)}</ul>
                  )}
                  <button className="btn-link" style={{ marginTop:8 }}
                    onClick={() => go("detail",{ trial:trial.nctId, disease:diseaseId })}>
                    View full trial details →
                  </button>
                </div>
              );
            })}
            <div className="disclaimer">
              This assessment uses publicly available eligibility data and is not medical advice.
              Always contact each trial's coordinator directly to confirm eligibility.
            </div>
            <div className="w-nav" style={{ marginTop:"1rem" }}>
              <button className="btn btn-muted" onClick={() => { setStep(initialStep); setResults([]); }}>Start over</button>
              {diseaseId && (
                <button className="btn btn-ghost" onClick={() => go("trials",{ disease:diseaseId })}>
                  Browse all {dc?.label || "disease"} trials
                </button>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
