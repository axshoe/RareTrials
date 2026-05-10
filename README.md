# RareTrials

**Universal rare disease clinical trial search and matching platform.**

A [Xiu Lab](https://thexiulab.org) project by Angie Xiu.  
Open source: [github.com/axshoe/raretrials](https://github.com/axshoe/raretrials)

---

## What it does

RareTrials monitors ClinicalTrials.gov across 100+ rare disease conditions, sorts trials by enrollment urgency, translates eligibility criteria into plain language, and maps trial sites by distance from the patient's location. A weekly automated update keeps every disease current without manual intervention.

Any patient advocacy organization can embed a filtered, disease-specific view on their website with one iframe tag.

## Embed on your website

```html
<iframe
  src="https://raretrials.vercel.app?embed=1&disease=angelman"
  width="100%"
  height="700"
  frameborder="0"
></iframe>
```

Replace `angelman` with any disease ID from the registry.

## How trials are sorted

1. Opening soon (not yet recruiting)
2. Enrolling now (actively recruiting)
3. By invitation only
4. Active, enrollment closed
5. Completed / terminated / withdrawn (greyed out, at the bottom)

## Adding a new disease

In `src/api/diseases.js`:
```js
{ id: "your_id", label: "Disease Name", category: "neuro",
  queries: ["Disease Name", "GENE", "drug name"],
  org: "Patient Organization", orgUrl: "https://..." },
```

In `backend/updater.py`:
```python
"your_id": ["Disease Name", "GENE", "drug name"],
```

## Tech stack

- React 18, Create React App, Vercel (free)
- Leaflet.js (CDN) for maps
- Haversine distance from scratch
- OpenStreetMap Nominatim for zip geocoding (no API key)
- ClinicalTrials.gov REST API v2 (no authentication)
- Python + SQLite backend via GitHub Actions weekly cron

## Relationship to TrialNavigator

TrialNavigator (v2) is the partner-facing embed tool for the Buffalo Initiative and CACNA1A Foundation networks. RareTrials is the public, universal version covering all rare diseases. Both use the same ClinicalTrials.gov API architecture. They coexist: patient organizations in the Buffalo network use TrialNavigator embeds; any organization in the broader rare disease ecosystem can use RareTrials.

## License

MIT
