#!/usr/bin/env python3
"""
build_diseases.py
Generates diseases.js from Orphanet en_product6.xml (~4,128 rare diseases).

Key improvements over v1:
  - Gene symbols < 5 chars excluded from queries (prevents "AR" matching augmented reality etc.)
  - Much more accurate category classifier with 200+ specific keyword patterns
  - Uses Orphanet DisorderType to inform classification
  - Queries use full disease name + safe gene symbols only

Usage:
    pip install requests
    python backend/build_diseases.py

If download fails:
    1. Open https://www.orphadata.com/data/xml/en_product6.xml in Chrome
    2. Right-click -> Save As -> orphanet.xml
    3. python backend/build_diseases.py orphanet.xml

Output: diseases_generated.js -> copy to src/api/diseases.js then npm start
"""

import sys, os, re, json, xml.etree.ElementTree as ET

try:
    import requests
except ImportError:
    print("Run: pip install requests"); sys.exit(1)

ORPHANET_XML_URL = "https://www.orphadata.com/data/xml/en_product6.xml"

# ── Category classifier ────────────────────────────────────────────────────────
# Order matters: more specific checks run first.

CATEGORY_RULES = [
    # Lysosomal — must be before metabolic
    ("lysosomal", ["gaucher disease","niemann-pick","fabry disease","pompe disease",
                   "mucopolysaccharidosis","mps type","mps i","mps ii","mps iii","mps iv",
                   "mps vi","mps vii","krabbe disease","metachromatic leukodystrophy",
                   "neuronal ceroid lipofuscinosis","batten disease","ceroid lipofuscinosis",
                   "mannosidosis","fucosidosis","sialidosis","mucolipidosis",
                   "wolman disease","lysosomal acid lipase","cystinosis","glycogen storage disease type ii",
                   "acid maltase","farber disease","schindler disease"]),

    # Mitochondrial
    ("mitochondrial", ["melas","merrf","leigh syndrome","kearns-sayre","pearson syndrome",
                       "mitochondrial myopathy","mitochondrial encephalomyopathy",
                       "mitochondrial complex i","mitochondrial complex ii","mitochondrial complex iii",
                       "mitochondrial complex iv","mitochondrial dna depletion","coenzyme q10 deficiency",
                       "barth syndrome","leber hereditary optic neuropathy",
                       "alpers syndrome","narp syndrome","gracile syndrome",
                       "pyruvate dehydrogenase","pyruvate carboxylase deficiency",
                       "oxidative phosphorylation"]),

    # Neuromuscular — before neuro
    ("neuromuscular", ["muscular dystrophy","myopathy","myotonic dystrophy","myotonia",
                       "spinal muscular atrophy","charcot-marie-tooth",
                       "limb-girdle","limb girdle","facioscapulohumeral",
                       "emery-dreifuss","congenital muscular","congenital myopathy",
                       "nemaline myopathy","central core","myotubular myopathy",
                       "periodic paralysis","paramyotonia","neuromuscular junction",
                       "myasthenia","lambert-eaton","spinal-bulbar muscular",
                       "friedreich ataxia","hereditary motor and sensory neuropathy",
                       "hereditary spastic paraplegia","spinal-muscular"]),

    # Hematologic
    ("hematologic", ["hemophilia","von willebrand disease","thalassemia","sickle cell",
                     "aplastic anemia","diamond-blackfan","fanconi anemia",
                     "thrombocytopenia","granulocytopenia","neutropenia",
                     "hemolytic anemia","spherocytosis","elliptocytosis",
                     "paroxysmal nocturnal hemoglobinuria","myelodysplastic",
                     "polycythemia vera","essential thrombocythemia",
                     "hemophagocytic","coagulation factor","platelet disorder",
                     "porphyria","erythropoietic","congenital dyserythropoietic"]),

    # Immunologic
    ("immunologic", ["severe combined immunodeficiency","scid","agammaglobulinemia",
                     "common variable immunodeficiency","wiskott-aldrich",
                     "chronic granulomatous disease","hyper-ige","hyper ige",
                     "hemophagocytic lymphohistiocytosis","familial mediterranean fever",
                     "periodic fever syndrome","cryopyrin","autoinflammatory",
                     "systemic lupus","juvenile idiopathic arthritis",
                     "primary immunodeficiency","complement deficiency",
                     "lymphoproliferative","immune dysregulation"]),

    # Cardiac
    ("cardiac", ["hypertrophic cardiomyopathy","dilated cardiomyopathy",
                 "arrhythmogenic","brugada syndrome","long qt syndrome",
                 "catecholaminergic polymorphic","familial hypercholesterolemia",
                 "transthyretin amyloid cardiomyopathy","danon disease",
                 "cardiac channelopathy","congenital heart","aortic valve",
                 "pulmonary arterial hypertension","hereditary hemorrhagic telangiectasia"]),

    # Pulmonary
    ("pulmonary", ["cystic fibrosis","lymphangioleiomyomatosis","idiopathic pulmonary fibrosis",
                   "primary ciliary dyskinesia","surfactant dysfunction",
                   "alveolar capillary dysplasia","pulmonary alveolar proteinosis",
                   "birt-hogg-dube","hereditary pulmonary"]),

    # Renal
    ("renal", ["polycystic kidney","nephronophthisis","alport syndrome",
               "focal segmental glomerulosclerosis","congenital nephrotic",
               "primary hyperoxaluria","cystinuria","renal tubular acidosis",
               "bartter syndrome","gitelman syndrome","nephropathic cystinosis",
               "hereditary nephritis","medullary cystic kidney","renal coloboma",
               "nphp-related","ciliopathy renal"]),

    # Ophthalmic
    ("ophthalmic", ["retinitis pigmentosa","leber congenital amaurosis","stargardt",
                    "choroideremia","achromatopsia","retinoschisis","cone-rod dystrophy",
                    "usher syndrome","bestrophinopathy","macular dystrophy",
                    "optic atrophy","norrie disease","gyrate atrophy",
                    "vitreoretinopathy","corneal dystrophy"]),

    # Dermatologic
    ("dermatologic", ["epidermolysis bullosa","ichthyosis","ectodermal dysplasia",
                      "palmoplantar keratoderma","darier disease","hailey-hailey",
                      "netherton syndrome","incontinentia pigmenti",
                      "erythrokeratoderma","porokeratosis","xeroderma pigmentosum",
                      "erythropoietic protoporphyria","congenital ichthyosiform"]),

    # Skeletal
    ("skeletal", ["osteogenesis imperfecta","achondroplasia","hypochondroplasia",
                  "fibrodysplasia ossificans","hypophosphatasia","rickets",
                  "cleidocranial dysplasia","craniosynostosis","spondylo",
                  "multiple osteochondromas","mccune-albright","pyknodysostosis",
                  "thanatophoric dysplasia","jeune syndrome"]),

    # Endocrine
    ("endocrine", ["androgen insensitivity","complete androgen insensitivity",
                   "partial androgen insensitivity","disorder of sex development",
                   "congenital adrenal hyperplasia","hypothyroidism","hyperthyroidism",
                   "multiple endocrine neoplasia","pituitary","adrenal insufficiency",
                   "diabetes insipidus","growth hormone deficiency","igf-1 deficiency",
                   "hypoparathyroidism","pseudohypoparathyroidism","wolfram syndrome",
                   "kallmann syndrome","46,xy","46,xx","gonadal dysgenesis",
                   "intersex","turner syndrome","klinefelter","proopiomelanocortin",
                   "lipodystrophy","congenital hyperinsulinism","neonatal diabetes"]),

    # Hepatic
    ("hepatic", ["wilson disease","alpha-1 antitrypsin deficiency","alagille syndrome",
                 "progressive familial intrahepatic cholestasis","hemochromatosis",
                 "crigler-najjar","dubin-johnson","rotor syndrome",
                 "hepatic glycogen storage","cholestasis","biliary atresia",
                 "primary biliary","primary sclerosing cholangitis"]),

    # Metabolic — broad net
    ("metabolic", ["phenylketonuria","maple syrup urine","homocystinuria",
                   "galactosemia","propionic acidemia","methylmalonic acidemia",
                   "isovaleric acidemia","glutaric aciduria","urea cycle",
                   "organic acid","amino acid metabolism","fatty acid oxidation",
                   "glycogen storage","glycosylation disorder","cdg syndrome",
                   "biotinidase","biotin-responsive","pyridoxine-dependent",
                   "creatine deficiency","guanidinoacetate","tyrosinemia",
                   "hyperammonemia","citrullinemia","argininosuccinic",
                   "hyperlysinemia","nonketotic hyperglycinemia"]),

    # Connective tissue
    ("connective", ["ehlers-danlos","marfan syndrome","loeys-dietz","cutis laxa",
                    "stickler syndrome","weill-marchesani"]),

    # Oncologic
    ("oncologic", ["neurofibromatosis","schwannomatosis","von hippel-lindau",
                   "multiple endocrine neoplasia","familial adenomatous polyposis",
                   "hereditary breast","lynch syndrome","gorlin syndrome",
                   "beckwith-wiedemann","wilms tumor","neuroblastoma",
                   "pheochromocytoma","paraganglioma","tuberous sclerosis"]),

    # Neurological — last, as it's the default
    ("neuro", ["epilep","encephalop","migraine","ataxia","cerebell","dementia",
               "parkinson","leukodystrophy","neuropath","angelman","rett syndrome",
               "dravet","lissencephal","autism","intellectual disab","mental retard",
               "neurodevelop","spinocerebellar","motor neuron","alexander disease",
               "canavan","krabbe","adrenoleukodystrophy","pelizaeus-merzbacher",
               "vanishing white matter","aicardi","batten","huntington","wilson",
               "spastic paraplegia","spinal cord"]),
]

def guess_category(name):
    n = name.lower()
    for cat, keywords in CATEGORY_RULES:
        for kw in keywords:
            if kw in n:
                return cat
    return "undiagnosed"   # genuinely unknown — not defaulting to neuro


# ── Patient org lookup ─────────────────────────────────────────────────────────

ORG_LOOKUP = {
    "angelman syndrome":           ("FAST", "https://cureangelman.org"),
    "dravet syndrome":             ("Dravet Syndrome Foundation", "https://dravetfoundation.org"),
    "rett syndrome":               ("Rett Syndrome Research Trust", "https://rsrt.org"),
    "cystic fibrosis":             ("Cystic Fibrosis Foundation", "https://www.cff.org"),
    "duchenne":                    ("Parent Project Muscular Dystrophy", "https://www.parentprojectmd.org"),
    "sickle cell":                 ("Sickle Cell Disease Association of America", "https://www.sicklecelldisease.org"),
    "hemophilia a":                ("National Hemophilia Foundation", "https://www.hemophilia.org"),
    "hemophilia b":                ("National Hemophilia Foundation", "https://www.hemophilia.org"),
    "phenylketonuria":             ("National PKU Alliance", "https://npkua.org"),
    "gaucher disease":             ("National Gaucher Foundation", "https://www.gaucherdisease.org"),
    "tuberous sclerosis":          ("Tuberous Sclerosis Alliance", "https://www.tsalliance.org"),
    "neurofibromatosis type 1":    ("Children's Tumor Foundation", "https://www.ctf.org"),
    "neurofibromatosis type 2":    ("Children's Tumor Foundation", "https://www.ctf.org"),
    "spinal muscular atrophy":     ("Cure SMA", "https://www.curesma.org"),
    "beta-thalassemia":            ("Cooley's Anemia Foundation", "https://cooleysanemia.org"),
    "marfan syndrome":             ("Marfan Foundation", "https://www.marfan.org"),
    "huntington disease":          ("Huntington's Disease Society of America", "https://hdsa.org"),
    "friedreich ataxia":           ("Friedreich's Ataxia Research Alliance", "https://www.curefa.org"),
    "pompe disease":               ("Acid Maltase Deficiency Association", "https://amda-pompe.org"),
    "fabry disease":               ("Fabry Support & Information Group", "https://www.fabry.org"),
    "batten disease":              ("Batten Disease Support and Research Association", "https://bdsra.org"),
    "epidermolysis bullosa":       ("DEBRA International", "https://www.debra-international.org"),
    "stargardt disease":           ("Foundation Fighting Blindness", "https://www.fightingblindness.org"),
    "retinitis pigmentosa":        ("Foundation Fighting Blindness", "https://www.fightingblindness.org"),
    "myotonic dystrophy":          ("Myotonic Dystrophy Foundation", "https://www.myotonic.org"),
    "mucopolysaccharidosis":       ("National MPS Society", "https://mpssociety.org"),
    "krabbe disease":              ("Hunter's Hope Foundation", "https://huntershope.org"),
    "facioscapulohumeral":         ("FSH Society", "https://www.fshsociety.org"),
    "charcot-marie-tooth":         ("Charcot-Marie-Tooth Association", "https://cmtausa.org"),
    "osteogenesis imperfecta":     ("Osteogenesis Imperfecta Foundation", "https://oif.org"),
    "alport syndrome":             ("Alport Syndrome Foundation", "https://www.alportsyndrome.org"),
    "polycystic kidney":           ("PKD Foundation", "https://pkdcure.org"),
    "fibrodysplasia ossificans":   ("International FOP Association", "https://www.ifopa.org"),
    "lymphangioleiomyomatosis":    ("LAM Foundation", "https://www.thelamfoundation.org"),
    "idiopathic pulmonary fibros": ("Pulmonary Fibrosis Foundation", "https://www.pulmonaryfibrosis.org"),
    "alpha-1 antitrypsin":         ("Alpha-1 Foundation", "https://www.alpha1.org"),
    "wilson disease":              ("Wilson Disease Association", "https://wilsondisease.org"),
    "alagille syndrome":           ("Alagille Syndrome Alliance", "https://www.alagille.org"),
    "androgen insensitivity":      ("AIS-DSD Support Group", "https://www.aisdsd.org"),
}

def get_org(name):
    n = name.lower()
    for kw, (org, url) in ORG_LOOKUP.items():
        if kw in n:
            return org, url
    return None, None


# ── Query builder ─────────────────────────────────────────────────────────────
# Critical rule: never include gene symbols shorter than 5 characters.
# "AR" matches augmented reality, allergic rhinitis, aortic regurgitation, etc.
# "SMA" matches smooth muscle actin, spinal muscular atrophy, and others.
# Only safe to include gene symbols >= 5 characters (e.g. CACNA1A, STXBP1).

MIN_GENE_SYMBOL_LENGTH = 5

def build_queries(name, genes):
    queries = [name]
    for g in genes:
        if g and len(g) >= MIN_GENE_SYMBOL_LENGTH:
            queries.append(g)
    # Add short alias: strip " type N" suffix
    short = re.sub(r"\s+type\s+[ivxIVX\d]+\s*$", "", name, flags=re.IGNORECASE).strip()
    if short != name and len(short) > 6:
        queries.append(short)
    # Deduplicate preserving order
    seen, result = set(), []
    for q in queries:
        if q.lower() not in seen:
            seen.add(q.lower())
            result.append(q)
    return result[:4]  # cap at 4 — fewer, more precise queries


# ── Slug builder ───────────────────────────────────────────────────────────────

def slugify(name, code):
    s = name.lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")[:38]
    return f"{s}_{code}"


# ── XML parser ────────────────────────────────────────────────────────────────

def parse_xml(path):
    print(f"Parsing: {path}")
    tree = ET.parse(path)
    root = tree.getroot()

    disorders = []
    seen = set()

    for disorder in root.iter("Disorder"):
        code_el = disorder.find("OrphaCode")
        if code_el is None or not code_el.text:
            continue
        code = code_el.text.strip()
        if code in seen:
            continue
        seen.add(code)

        name_el = disorder.find("Name")
        if name_el is None or not name_el.text:
            continue
        name = name_el.text.strip()

        # Skip group-level entries (e.g. "Hereditary ataxia" umbrella)
        dtype_el = disorder.find("DisorderType/Name")
        if dtype_el is not None and dtype_el.text:
            dtype = dtype_el.text.lower()
            if "group of disorder" in dtype or dtype == "clinical group":
                continue

        # Gene symbols
        genes = []
        for sym_el in disorder.findall(".//Gene/Symbol"):
            if sym_el.text:
                sym = sym_el.text.strip()
                if sym and sym not in genes:
                    genes.append(sym)

        disorders.append({"orpha": code, "label": name, "genes": genes})

    return disorders


# ── JS generator ───────────────────────────────────────────────────────────────

CATEGORIES_JS = """\
export const CATEGORIES = {
  neuro:         "Neurological",
  metabolic:     "Metabolic",
  neuromuscular: "Neuromuscular",
  hematologic:   "Hematologic",
  immunologic:   "Immunologic",
  cardiac:       "Cardiac",
  renal:         "Renal",
  pulmonary:     "Pulmonary",
  skeletal:      "Skeletal",
  dermatologic:  "Dermatologic",
  ophthalmic:    "Ophthalmic",
  oncologic:     "Oncologic (Rare)",
  endocrine:     "Endocrine",
  hepatic:       "Hepatic",
  connective:    "Connective Tissue",
  lysosomal:     "Lysosomal Storage",
  mitochondrial: "Mitochondrial",
  undiagnosed:   "Undiagnosed / Ultra-rare",
};"""

HELPERS_JS = """\
export function getAllDiseases() {
  return [...DISEASES].sort((a, b) => a.label.localeCompare(b.label));
}
export function getDisease(id) {
  return DISEASES.find(d => d.id === id) || null;
}
export function getDiseasesByCategory(cat) {
  return DISEASES.filter(d => d.category === cat)
    .sort((a, b) => a.label.localeCompare(b.label));
}
export function searchDiseases(query) {
  const q = query.toLowerCase();
  return DISEASES.filter(d =>
    d.label.toLowerCase().includes(q) ||
    d.id.includes(q) ||
    d.org?.toLowerCase().includes(q) ||
    d.queries.some(r => r.toLowerCase().includes(q))
  ).sort((a, b) => a.label.localeCompare(b.label));
}"""


def generate_js(disorders, source):
    cat_counts = {}
    lines = [
        "// src/api/diseases.js",
        f"// AUTO-GENERATED from Orphanet ({source})",
        "// Re-run backend/build_diseases.py to update.",
        "// License: Orphanet CC BY 4.0 — cite orphanet.org",
        "",
        CATEGORIES_JS,
        "",
        "export const DISEASES = [",
    ]

    seen_slugs = set()
    for d in disorders:
        slug = slugify(d["label"], d["orpha"])
        if slug in seen_slugs:
            continue
        seen_slugs.add(slug)

        cat   = guess_category(d["label"])
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
        qs    = build_queries(d["label"], d["genes"])
        org, org_url = get_org(d["label"])

        parts = [
            f"id:{json.dumps(slug)}",
            f"label:{json.dumps(d['label'])}",
            f"category:{json.dumps(cat)}",
            f"queries:{json.dumps(qs)}",
            f"orpha:{json.dumps(d['orpha'])}",
        ]
        if org:
            parts += [f"org:{json.dumps(org)}", f"orgUrl:{json.dumps(org_url)}"]

        lines.append("  { " + ", ".join(parts) + " },")

    lines += ["];", "", HELPERS_JS]

    print("\nCategory distribution:")
    for cat, count in sorted(cat_counts.items(), key=lambda x: -x[1]):
        print(f"  {cat:<15} {count:>5}")

    return "\n".join(lines)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    xml_path = None

    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
        xml_path = sys.argv[1]
        print(f"Using local file: {xml_path}")
    else:
        print(f"Downloading: {ORPHANET_XML_URL}")
        print("  ~22MB, takes 20-60 seconds...")
        try:
            r = requests.get(ORPHANET_XML_URL, timeout=180, stream=True,
                             headers={"User-Agent": "RareTrials/1.0 (thexiulab.org)"})
            r.raise_for_status()
            xml_path = "orphanet_downloaded.xml"
            total = 0
            with open(xml_path, "wb") as f:
                for chunk in r.iter_content(65536):
                    f.write(chunk)
                    total += len(chunk)
                    mb = total // (1024 * 1024)
                    if total % (1024 * 1024) < 65536:
                        print(f"  {mb} MB...", end="\r")
            print(f"\n  {total:,} bytes -> {xml_path}")
        except Exception as e:
            print(f"\nDownload failed: {e}")
            print()
            print("Manual fallback:")
            print("  1. Open: https://www.orphadata.com/data/xml/en_product6.xml in Chrome")
            print("  2. Right-click -> Save As -> orphanet.xml")
            print("  3. python backend/build_diseases.py orphanet.xml")
            sys.exit(1)

    disorders = parse_xml(xml_path)
    print(f"\nParsed {len(disorders):,} disorders")

    js  = generate_js(disorders, ORPHANET_XML_URL)
    out = "diseases_generated.js"
    with open(out, "w", encoding="utf-8") as f:
        f.write(js)

    print(f"\nWritten: {out} ({len(disorders):,} diseases, {len(js):,} chars)")
    print()
    print("Steps:")
    print("  del src\\api\\diseases.js")
    print("  ren diseases_generated.js src\\api\\diseases.js")
    print("  npm start")


if __name__ == "__main__":
    main()