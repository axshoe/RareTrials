import React, { useState, useEffect, useRef } from "react";
import { fetchStudyById, parseEligibilityCriteria } from "../api/clinicaltrials";
import { getDisease } from "../api/diseases";
import { geocodeZip, sortByDistance, haversineDistance, driveLabel } from "../utils/geo";

export default function TrialDetail({ nctId, disease, go }) {
  const [trial, setTrial]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [zip, setZip]         = useState("");
  const [userLoc, setUserLoc] = useState(null);
  const [sites, setSites]     = useState([]);
  const [showAll, setShowAll] = useState(false);
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const dc = disease ? getDisease(disease) : null;

  useEffect(() => {
    if (!nctId) return;
    fetchStudyById(nctId)
      .then(data => { setTrial(data); setSites(data.locations); })
      .catch(() => setError(`Could not load trial ${nctId}.`))
      .finally(() => setLoading(false));
  }, [nctId]);

  // Map: poll for Leaflet CDN, then build
  useEffect(() => {
    if (!trial || !mapRef.current) return;
    let interval, attempts = 0;
    interval = setInterval(() => {
      attempts++;
      if (attempts > 40) { clearInterval(interval); return; }
      if (typeof window.L === "undefined") return;
      clearInterval(interval);
      if (!mapObj.current) {
        mapObj.current = window.L.map(mapRef.current, { center: [20, 0], zoom: 2 });
        window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors",
        }).addTo(mapObj.current);
      }
      drawMarkers(trial.locations, null);
    }, 200);
    return () => clearInterval(interval);
  }, [trial]);

  useEffect(() => {
    if (!mapObj.current || !trial || !userLoc) return;
    const sorted = sortByDistance(trial.locations, userLoc.lat, userLoc.lng);
    setSites(sorted);
    drawMarkers(sorted, userLoc);
  }, [userLoc]);

  function drawMarkers(locs, loc) {
    if (!mapObj.current || typeof window.L === "undefined") return;
    const L = window.L, map = mapObj.current;
    map.eachLayer(l => { if (l instanceof L.Marker || l instanceof L.Circle) map.removeLayer(l); });
    const valid = locs.filter(s => s.lat && s.lng);
    valid.forEach(s => {
      const popup = [`<strong>${s.facility||"Site"}</strong>`,
        [s.city,s.state,s.country].filter(Boolean).join(", "),
        s.contacts?.[0]?.email ? `<a href="mailto:${s.contacts[0].email}">${s.contacts[0].email}</a>` : ""
      ].filter(Boolean).join("<br/>");
      L.marker([s.lat,s.lng]).addTo(map).bindPopup(popup);
    });
    if (loc) L.circle([loc.lat,loc.lng],{color:"#0d7a7a",fillColor:"#0d7a7a",fillOpacity:0.15,radius:50000}).addTo(map);
    if (valid.length > 0) {
      const group = L.featureGroup(valid.map(s => L.marker([s.lat,s.lng])));
      try { map.fitBounds(group.getBounds().pad(0.35)); } catch {}
    }
    setTimeout(() => { try { map.invalidateSize(); } catch {} }, 300);
  }

  async function handleZip() {
    if (!zip.trim()) return;
    const loc = await geocodeZip(zip);
    if (!loc) { alert("Could not find that zip code. Try a 5-digit US zip."); return; }
    setUserLoc(loc);
  }

  if (loading) return <div className="page"><div className="loading">Loading trial details...</div></div>;
  if (error || !trial) return (
    <div className="page">
      <button className="btn-back" onClick={() => go("trials",{disease})}>← Back</button>
      <div className="error-msg" style={{marginTop:"1rem"}}>{error || "Trial not found."}</div>
    </div>
  );

  const { inclusion, exclusion } = parseEligibilityCriteria(trial.eligibilityCriteria);
  const showInc = showAll ? inclusion : inclusion.slice(0,5);
  const showExc = showAll ? exclusion : exclusion.slice(0,5);

  return (
    <div className="page">
      <button className="btn-back" onClick={() => go("trials",{disease})}>← {dc ? dc.label : "Trials"}</button>

      <div style={{ marginTop:"1rem", marginBottom:"2rem" }}>
        <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:7 }}>
          <span style={{ fontFamily:"var(--mono)", fontSize:"0.72rem", color:"var(--ink-3)" }}>{trial.nctId}</span>
          {trial.phase && <span className="pill pill-neutral">{trial.phase}</span>}
          <span className={`pill ${trial.status==="RECRUITING"?"pill-recruiting":trial.status==="NOT_YET_RECRUITING"?"pill-upcoming":trial.status==="ACTIVE_NOT_RECRUITING"?"pill-active":"pill-neutral"}`}>
            {trial.status?.replace(/_/g," ")}
          </span>
        </div>
        <h1 style={{ fontFamily:"var(--serif)", fontSize:"1.5rem", fontWeight:700, letterSpacing:"-0.01em", lineHeight:1.25, marginBottom:"0.5rem" }}>{trial.title}</h1>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {trial.conditions.map((c,i) => (
            <span key={i} style={{ fontSize:"0.78rem", background:"var(--rule-lt)", color:"var(--ink-2)", padding:"2px 8px", borderRadius:2 }}>{c}</span>
          ))}
        </div>
      </div>

      <div className="detail-section">
        <h2>Summary</h2>
        <p style={{ fontFamily:"var(--serif)", lineHeight:1.75, fontSize:"0.9375rem", color:"var(--ink-2)" }}>{trial.briefSummary}</p>
      </div>

      <div className="detail-section">
        <h2>Eligibility</h2>
        <div className="info-strip">
          {trial.minAge && <div><div className="info-cell-lbl">Minimum age</div><div className="info-cell-val">{trial.minAge}</div></div>}
          {trial.maxAge && <div><div className="info-cell-lbl">Maximum age</div><div className="info-cell-val">{trial.maxAge}</div></div>}
          {trial.sex    && <div><div className="info-cell-lbl">Sex</div><div className="info-cell-val">{trial.sex}</div></div>}
        </div>

        {inclusion.length > 0 && (<><h3>Inclusion criteria</h3><ul className="criteria-list">{showInc.map((c,i)=><li key={i}>{c}</li>)}</ul></>)}
        {exclusion.length > 0 && (<><h3>Exclusion criteria</h3><ul className="criteria-list">{showExc.map((c,i)=><li key={i}>{c}</li>)}</ul></>)}
        {(inclusion.length > 5 || exclusion.length > 5) && (
          <button className="btn-link" style={{marginTop:"0.75rem"}} onClick={() => setShowAll(v=>!v)}>
            {showAll ? "Show fewer" : `Show all ${inclusion.length+exclusion.length} criteria`}
          </button>
        )}

        <div className="callout">
          Eligibility questions? Contact the trial coordinator directly rather than self-screening out.
          {trial.locations?.[0]?.contacts?.[0]?.email && (
            <> &nbsp;·&nbsp; <a href={`mailto:${trial.locations[0].contacts[0].email}`}>{trial.locations[0].contacts[0].email}</a></>
          )}
        </div>
      </div>

      <div className="detail-section">
        <h2>Trial sites</h2>
        <div className="zip-row">
          <input className="zip-input" placeholder="Zip code for distance" value={zip}
            onChange={e=>setZip(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleZip()} />
          <button className="btn btn-ghost" onClick={handleZip}>Find nearest</button>
        </div>
        <div id="leaflet-map" ref={mapRef} style={{ height:320 }} />
        <div className="site-list">
          {sites.slice(0,15).map((s,i) => (
            <div key={i} className="site-item">
              <span className="site-name">{s.facility||"Site"}</span>
              <span style={{color:"var(--ink-3)",fontSize:"0.8rem"}}>{[s.city,s.state,s.country].filter(Boolean).join(", ")}</span>
              {userLoc && s.lat && s.lng && (
                <span className="site-dist">{driveLabel(haversineDistance(userLoc.lat,userLoc.lng,s.lat,s.lng))}</span>
              )}
              {s.contacts?.[0]?.email && <a href={`mailto:${s.contacts[0].email}`} style={{fontSize:"0.78rem"}}>{s.contacts[0].email}</a>}
            </div>
          ))}
          {sites.length === 0 && <div style={{fontSize:"0.875rem",color:"var(--ink-3)"}}>No site coordinates available. View full details on ClinicalTrials.gov.</div>}
        </div>
        <div style={{marginTop:"0.875rem"}}>
          <a href={`https://clinicaltrials.gov/study/${trial.nctId}`} target="_blank" rel="noreferrer"
            style={{fontSize:"0.84rem"}}>View full record on ClinicalTrials.gov ↗</a>
        </div>
      </div>
    </div>
  );
}
