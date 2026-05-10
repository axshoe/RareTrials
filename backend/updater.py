"""
RareTrials backend/updater.py
Weekly trial data updater. Run via GitHub Actions or manually.

Usage:
    python backend/updater.py
    python backend/updater.py --disease sma
    python backend/updater.py --dry-run
"""

import json, sqlite3, requests, time, os, argparse
from datetime import datetime

DB     = os.environ.get("DB_PATH",    "raretrials.db")
CACHE  = os.environ.get("CACHE_PATH", "public/trials_cache.json")
DIGEST = os.environ.get("DIGEST_PATH","public/update_digest.json")
BASE   = "https://clinicaltrials.gov/api/v2/studies"

DISEASE_QUERIES = {
    "cacna1a":      ["CACNA1A","familial hemiplegic migraine","episodic ataxia type 2","FHM1"],
    "angelman":     ["Angelman syndrome","UBE3A","GTX-102","MVX-220"],
    "stxbp1":       ["STXBP1","bexicaserin","LP352"],
    "kif1a":        ["KIF1A","KAND","KIF1A associated neurological disorder"],
    "foxg1":        ["FOXG1 syndrome","FOXG1","FRF-001"],
    "dravet":       ["Dravet syndrome","SCN1A Dravet","fenfluramine Dravet"],
    "cdkl5":        ["CDKL5 deficiency","CDKL5","ganaxolone CDKL5"],
    "rett":         ["Rett syndrome","MECP2","trofinetide Rett"],
    "syngap1":      ["SYNGAP1","SynGAP intellectual disability"],
    "dup15q":       ["Dup15q syndrome","chromosome 15q duplication"],
    "grin2b":       ["GRIN2B encephalopathy","radiprodil","GRIN disorder"],
    "tuberous_sclerosis": ["tuberous sclerosis complex","TSC","everolimus TSC"],
    "batten":       ["Batten disease","neuronal ceroid lipofuscinosis","cerliponase alfa"],
    "niemann_pick_c": ["Niemann-Pick disease type C","NPC","arimoclomol NPC"],
    "sma":          ["spinal muscular atrophy","SMA","nusinersen","onasemnogene","risdiplam"],
    "dmd":          ["Duchenne muscular dystrophy","DMD","exon skipping DMD"],
    "fshd":         ["facioscapulohumeral muscular dystrophy","FSHD","losmapimod FSHD"],
    "friedreich_ataxia": ["Friedreich ataxia","frataxin","omaveloxolone"],
    "cf":           ["cystic fibrosis","CFTR","elexacaftor tezacaftor"],
    "scd":          ["sickle cell disease","voxelotor","crizanlizumab","gene therapy sickle cell"],
    "beta_thal":    ["beta thalassemia","betibeglogene","luspatercept thalassemia"],
    "hemophilia_a": ["hemophilia A","factor VIII","fitusiran","valoctocogene"],
    "hemophilia_b": ["hemophilia B","factor IX","etranacogene","fidanacogene"],
    "gaucher":      ["Gaucher disease","glucocerebrosidase","imiglucerase"],
    "fabry":        ["Fabry disease","alpha-galactosidase A deficiency","agalsidase"],
    "mps1":         ["mucopolysaccharidosis type 1","MPS I","Hurler syndrome"],
    "mps2":         ["mucopolysaccharidosis type 2","MPS II","Hunter syndrome"],
    "glut1":        ["GLUT1 deficiency","SLC2A1","De Vivo disease"],
    "phenylketonuria": ["phenylketonuria","PKU","sapropterin","pegvaliase"],
    "pompe":        ["Pompe disease","GAA deficiency","alglucosidase"],
    "mld":          ["metachromatic leukodystrophy","MLD","arylsulfatase A"],
    "ald":          ["adrenoleukodystrophy","ALD","ABCD1","leriglitazone"],
    "nf1":          ["neurofibromatosis type 1","NF1","selumetinib NF1"],
    "nf2":          ["neurofibromatosis type 2","NF2","vestibular schwannoma"],
    "hcm":          ["hypertrophic cardiomyopathy","HCM","mavacamten","aficamten"],
    "marfan":       ["Marfan syndrome","FBN1 fibrillin","losartan Marfan"],
    "eb":           ["epidermolysis bullosa","COL7A1","beremagene","gene therapy EB"],
    "lca":          ["Leber congenital amaurosis","RPE65 LCA","voretigene neparvovec"],
    "stargardt":    ["Stargardt disease","ABCA4 macular dystrophy"],
    "at":           ["ataxia-telangiectasia","ATM deficiency","levacetylleucine AT"],
    "alagille":     ["Alagille syndrome","JAG1","maralixibat"],
    "alpha1at":     ["alpha-1 antitrypsin deficiency","AATD","SERPINA1","fazirsiran"],
    "wilsons":      ["Wilson disease","ATP7B copper","trientine Wilson"],
    "adpkd":        ["autosomal dominant polycystic kidney","ADPKD","PKD1 PKD2","tolvaptan"],
}


def init_db(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS trials (
            nct_id TEXT PRIMARY KEY, disease TEXT,
            title TEXT, status TEXT, updated_at TEXT, data_json TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS changes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nct_id TEXT, disease TEXT, change_type TEXT,
            old_value TEXT, new_value TEXT, detected_at TEXT
        )
    """)
    conn.commit()


def fetch_query(q):
    try:
        r = requests.get(BASE,
            params={"query.cond":q,"query.term":q,"pageSize":100,"format":"json"},
            timeout=30)
        r.raise_for_status()
        return r.json().get("studies", [])
    except Exception as e:
        print(f"    Query failed '{q}': {e}")
        return []


def fetch_disease(disease_id, queries):
    seen = {}
    for q in queries:
        for s in fetch_query(q):
            nct = (s.get("protocolSection",{})
                    .get("identificationModule",{})
                    .get("nctId"))
            if nct and nct not in seen:
                seen[nct] = s
        time.sleep(0.4)
    return list(seen.values())


def store_and_diff(conn, studies, disease_id, dry_run=False):
    changes = []
    now = datetime.utcnow().isoformat()
    for s in studies:
        ps     = s.get("protocolSection", {})
        nct    = ps.get("identificationModule",{}).get("nctId","")
        title  = ps.get("identificationModule",{}).get("briefTitle","")
        status = ps.get("statusModule",{}).get("overallStatus","")
        if not nct:
            continue
        row = conn.execute("SELECT status FROM trials WHERE nct_id=?", (nct,)).fetchone()
        if row is None:
            changes.append({"nct_id":nct,"disease":disease_id,"change_type":"new_trial",
                            "old":None,"new":status,"at":now})
        elif row[0] != status:
            changes.append({"nct_id":nct,"disease":disease_id,"change_type":"status_change",
                            "old":row[0],"new":status,"at":now})
        if not dry_run:
            conn.execute("""
                INSERT INTO trials(nct_id,disease,title,status,updated_at,data_json)
                VALUES(?,?,?,?,?,?)
                ON CONFLICT(nct_id) DO UPDATE SET
                  disease=excluded.disease, title=excluded.title,
                  status=excluded.status, updated_at=excluded.updated_at,
                  data_json=excluded.data_json
            """, (nct, disease_id, title, status, now, json.dumps(s)))
    if not dry_run:
        for c in changes:
            conn.execute(
                "INSERT INTO changes(nct_id,disease,change_type,old_value,new_value,detected_at)"
                " VALUES(?,?,?,?,?,?)",
                (c["nct_id"],c["disease"],c["change_type"],c["old"],c["new"],c["at"])
            )
        conn.commit()
    return changes


def write_cache(conn):
    rows = conn.execute("SELECT disease,nct_id,title,status,data_json FROM trials").fetchall()
    by_disease = {}
    for disease,nct_id,title,status,data_json in rows:
        if disease not in by_disease:
            by_disease[disease] = []
        try:
            raw  = json.loads(data_json)
            ps   = raw.get("protocolSection",{})
            by_disease[disease].append({
                "nctId":        nct_id,
                "briefTitle":   ps.get("identificationModule",{}).get("briefTitle", title),
                "status":       status,
                "phase":       (ps.get("designModule",{}).get("phases") or [""])[0],
                "conditions":   ps.get("conditionsModule",{}).get("conditions",[]),
                "briefSummary": ps.get("descriptionModule",{}).get("briefSummary","")[:300],
                "locationCount":len(ps.get("contactsLocationsModule",{}).get("locations",[])),
            })
        except Exception:
            pass
    os.makedirs(os.path.dirname(CACHE) or ".", exist_ok=True)
    with open(CACHE, "w") as f:
        json.dump({"updated": datetime.utcnow().isoformat(), "diseases": by_disease}, f, indent=2)
    print(f"Cache written: {CACHE}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--disease",  help="Run for one disease ID only")
    ap.add_argument("--dry-run",  action="store_true")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    init_db(conn)

    to_run = ({args.disease: DISEASE_QUERIES[args.disease]}
              if args.disease and args.disease in DISEASE_QUERIES
              else DISEASE_QUERIES)

    all_changes = []
    for disease_id, queries in to_run.items():
        print(f"Processing: {disease_id}")
        studies = fetch_disease(disease_id, queries)
        print(f"  {len(studies)} studies found")
        changes = store_and_diff(conn, studies, disease_id, dry_run=args.dry_run)
        all_changes.extend(changes)

    if not args.dry_run:
        write_cache(conn)
        os.makedirs(os.path.dirname(DIGEST) or ".", exist_ok=True)
        with open(DIGEST,"w") as f:
            json.dump({"generated":datetime.utcnow().isoformat(),"changes":all_changes},f,indent=2)
        print(f"Digest: {DIGEST} ({len(all_changes)} change(s))")
    else:
        print(f"Dry run: {len(all_changes)} change(s) detected, nothing written")

    conn.close()
    print("Done.")

if __name__ == "__main__":
    main()
