// src/api/clinicaltrials.js
// ClinicalTrials.gov REST API v2
// https://clinicaltrials.gov/data-api/api
//
// THE KEY INSIGHT: query.cond searches ONLY the structured condition/disease
// field that trial registrants fill out. query.term searches ALL text including
// titles, descriptions, eligibility criteria — which causes false positives
// (e.g. "AR" matching augmented reality trials when searching for androgen
// receptor disorders).
//
// We use ONLY query.cond. This means results are strictly trials where a
// researcher explicitly listed the condition we're searching for. It returns
// fewer results, but every result is relevant.

const BASE = "https://clinicaltrials.gov/api/v2";

export const STATUS_ORDER = {
  NOT_YET_RECRUITING:      0,
  RECRUITING:              1,
  ENROLLING_BY_INVITATION: 2,
  ACTIVE_NOT_RECRUITING:   3,
  COMPLETED:               4,
  SUSPENDED:               5,
  TERMINATED:              6,
  WITHDRAWN:               7,
};

export const STATUS_LABEL = {
  RECRUITING:              "Enrolling now",
  NOT_YET_RECRUITING:      "Opening soon",
  ENROLLING_BY_INVITATION: "By invitation",
  ACTIVE_NOT_RECRUITING:   "Active — enrollment closed",
  COMPLETED:               "Completed",
  TERMINATED:              "Terminated",
  SUSPENDED:               "Suspended",
  WITHDRAWN:               "Withdrawn",
};

export const STATUS_EXPLAIN = {
  RECRUITING:              "This trial is accepting new participants.",
  NOT_YET_RECRUITING:      "This trial is planned but not yet open for enrollment.",
  ENROLLING_BY_INVITATION: "This trial only enrolls participants who are specifically invited.",
  ACTIVE_NOT_RECRUITING:   "This trial is running but is no longer accepting new participants.",
  COMPLETED:               "This trial has finished.",
  TERMINATED:              "This trial ended early.",
  WITHDRAWN:               "This trial was withdrawn before enrolling anyone.",
};

export function isDimmed(status) {
  return ["COMPLETED", "TERMINATED", "WITHDRAWN", "SUSPENDED"].includes(status);
}

// Search ClinicalTrials.gov by condition name only.
// query.cond searches the structured "Condition or Disease" field exclusively.
// This prevents false positives from title/description text matches.
async function searchByCondition(conditionName, pageSize = 100) {
  const url =
      `${BASE}/studies?query.cond=${encodeURIComponent(conditionName)}&pageSize=${pageSize}&format=json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.studies || []).map(normalizeStudy);
  } catch {
    return [];
  }
}

// Run multiple condition queries and deduplicate by NCT ID.
// Sorted by enrollment urgency (opening soon first, completed last).
export async function fetchTrialsForQueries(queries) {
  const seen = new Map();

  for (const q of queries) {
    const results = await searchByCondition(q);
    for (const study of results) {
      if (study.nctId && !seen.has(study.nctId)) {
        seen.set(study.nctId, study);
      }
    }
  }

  return Array.from(seen.values()).sort(
      (a, b) => (STATUS_ORDER[a.status] ?? 7) - (STATUS_ORDER[b.status] ?? 7)
  );
}

// Fetch a single study by NCT ID.
export async function fetchStudyById(nctId) {
  const res = await fetch(`${BASE}/studies/${nctId}?format=json`);
  if (!res.ok) throw new Error(`${res.status}`);
  return normalizeStudy(await res.json());
}

function normalizeStudy(raw) {
  const ps   = raw?.protocolSection ?? {};
  const id   = ps.identificationModule ?? {};
  const st   = ps.statusModule ?? {};
  const el   = ps.eligibilityModule ?? {};
  const locs = ps.contactsLocationsModule?.locations ?? [];
  const desc = ps.descriptionModule ?? {};
  const cond = ps.conditionsModule ?? {};
  const intv = ps.interventionsModule?.interventions ?? [];
  const des  = ps.designModule ?? {};

  return {
    nctId:               id.nctId ?? "",
    title:               id.officialTitle || id.briefTitle || "",
    briefTitle:          id.briefTitle || "",
    status:              st.overallStatus ?? "",
    startDate:           st.startDateStruct?.date ?? "",
    completionDate:      st.completionDateStruct?.date ?? "",
    phase:               (des.phases ?? [])[0] ?? "",
    eligibilityCriteria: el.eligibilityCriteria ?? "",
    minAge:              el.minimumAge ?? "",
    maxAge:              el.maximumAge ?? "",
    sex:                 el.sex ?? "",
    briefSummary:        desc.briefSummary ?? "",
    conditions:          cond.conditions ?? [],
    interventions:       intv.map(i => ({ type: i.type, name: i.name })),
    locations:           locs.map(l => ({
      facility: l.facility ?? "",
      city:     l.city ?? "",
      state:    l.state ?? "",
      country:  l.country ?? "",
      zip:      l.zip ?? "",
      lat:      l.geoPoint?.lat ?? null,
      lng:      l.geoPoint?.lon ?? null,
      contacts: l.contacts ?? [],
    })),
  };
}

export function parseEligibilityCriteria(text) {
  if (!text) return { inclusion: [], exclusion: [] };
  const incMatch = text.match(/inclusion criteria[:\s]*([\s\S]*?)(?=exclusion criteria|$)/i);
  const excMatch = text.match(/exclusion criteria[:\s]*([\s\S]*?)$/i);
  const parse = s => (s ?? "").split(/\n/)
      .map(l => l.replace(/^[\s\-*•\d.]+/, "").trim())
      .filter(l => l.length > 8);
  return { inclusion: parse(incMatch?.[1]), exclusion: parse(excMatch?.[1]) };
}