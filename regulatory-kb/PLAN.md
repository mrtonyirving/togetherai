# Regulatory Knowledge Base — Setup Plan

## 1. Overview

This repo is the single source of truth for all ontologies, relation definitions, source registries, and jurisdiction metadata that power the horizon scan product. Everything lives in Markdown (human-readable, editable by domain experts in the GitHub web UI) with co-located JSON schemas (machine-readable, consumed by crawlers and the analysis engine).

**Rendering**: MkDocs Material, deployed to GitHub Pages. Zero config for contributors — push to `main` and the site rebuilds automatically.

---

## 2. Architecture decisions

| Decision | Choice | Rationale |
|---|---|---|
| Rendering engine | MkDocs Material | Lightest setup. Single YAML config. Native GitHub Pages deploy via `gh-pages` action. |
| Content format | Markdown + YAML frontmatter | Domain experts edit in GitHub web UI. Frontmatter carries structured metadata. |
| Machine-readable output | Co-located JSON schemas + a build script that extracts frontmatter → JSON | Crawlers and analysis engine consume JSON. The build script (`scripts/build_json.py`) walks the `docs/` tree, parses frontmatter, and writes consolidated JSON to `dist/`. |
| Branching model | Trunk-based. `main` is production. Feature branches for new ontologies. | No formal approval gates requested. Keep it simple. |
| Contributor workflow | GitHub web UI → edit file → commit to branch → merge | No CLI, no local setup required for domain experts. |

---

## 3. Repo structure

```
regulatory-kb/
├── .github/
│   └── workflows/
│       ├── deploy-docs.yml          # Build & deploy MkDocs to GitHub Pages
│       └── build-json.yml           # Extract frontmatter → JSON on push
│
├── docs/                            # All content (MkDocs root)
│   ├── index.md                     # Landing page
│   │
│   ├── ontologies/                  # Ontology definitions by document type
│   │   ├── index.md                 # Overview: what ontologies are, how to contribute
│   │   │
│   │   ├── enforcement-actions/     # ← FIRST PRIORITY
│   │   │   ├── index.md             # Overview of enforcement action ontologies
│   │   │   ├── se.md                # Swedish enforcement action ontology
│   │   │   ├── no.md                # Norwegian
│   │   │   ├── dk.md                # Danish
│   │   │   ├── es.md                # Spanish
│   │   │   ├── schemas/
│   │   │   │   ├── se.schema.json   # JSON schema for SE enforcement actions
│   │   │   │   ├── no.schema.json
│   │   │   │   ├── dk.schema.json
│   │   │   │   └── es.schema.json
│   │   │   └── examples/
│   │   │       ├── se-example-001.md  # Real annotated example
│   │   │       ├── no-example-001.md
│   │   │       ├── dk-example-001.md
│   │   │       └── es-example-001.md
│   │   │
│   │   ├── guidelines/
│   │   │   ├── index.md
│   │   │   ├── schemas/
│   │   │   └── examples/
│   │   │
│   │   ├── directives/
│   │   │   ├── index.md
│   │   │   ├── schemas/
│   │   │   └── examples/
│   │   │
│   │   └── regulations/
│   │       ├── index.md
│   │       ├── schemas/
│   │       └── examples/
│   │
│   ├── relations/                   # Inter-document relation definitions
│   │   ├── index.md                 # Relation types and how to use them
│   │   └── relation-types.md        # Canonical list of relation types
│   │
│   ├── jurisdictions/               # Jurisdiction profiles
│   │   ├── index.md
│   │   ├── se/
│   │   │   └── index.md             # Sweden: authorities, legal framework, links
│   │   ├── no/
│   │   │   └── index.md
│   │   ├── dk/
│   │   │   └── index.md
│   │   ├── es/
│   │   │   └── index.md
│   │   └── eu/
│   │       └── index.md
│   │
│   └── sources/                     # Source registry
│       ├── index.md                 # How sources are structured
│       ├── se-sources.md            # Swedish regulatory sources
│       ├── no-sources.md
│       ├── dk-sources.md
│       ├── es-sources.md
│       └── eu-sources.md
│
├── schemas/                         # Shared/base JSON schemas
│   ├── ontology-base.schema.json    # Base schema all ontologies extend
│   └── relation.schema.json         # Schema for relation definitions
│
├── scripts/
│   ├── build_json.py                # Extracts frontmatter → dist/*.json
│   └── validate.py                  # Validates all .md frontmatter against schemas
│
├── mkdocs.yml                       # MkDocs Material configuration
├── requirements.txt                 # Python deps (mkdocs-material)
├── .gitignore
└── README.md
```

---

## 4. Setup steps

### Step 1: Create the repo
Create `regulatory-kb` on GitHub. Clone it. Copy this scaffold in. Push.

### Step 2: Enable GitHub Pages
Go to repo Settings → Pages → Source: GitHub Actions.

### Step 3: First deploy
The `deploy-docs.yml` workflow triggers on push to `main`. After first push the site will be live at `https://<org>.github.io/regulatory-kb/`.

### Step 4: Populate enforcement action ontologies
This is the immediate work. Start with `se.md` (most mature), then use it as the template for `no.md`, `dk.md`, `es.md`.

### Step 5: Add examples
For each jurisdiction, add at least one real annotated enforcement action in `examples/`. These serve as ground truth for the analysis engine and training data for the crawlers.

### Step 6: Wire up the JSON build
The `build-json.yml` workflow runs `scripts/build_json.py` which reads all `.md` files with ontology frontmatter and produces consolidated JSON. This JSON is what your crawlers and analysis engine consume.

---

## 5. How ontology files work

Every ontology file (e.g., `se.md`) has two parts:

1. **YAML frontmatter** — structured, machine-readable metadata. This is what gets extracted to JSON.
2. **Markdown body** — human-readable description, field explanations, notes for domain experts.

The frontmatter is the contract with the engineering team. The body is documentation for everyone.

---

## 6. How relations work

Relations are defined as typed links between document identifiers. For example:

```
Enforcement Action FI-2024-001
  ├── ENFORCES → SE Regulation FFFS 2017:11
  │                  └── IMPLEMENTS → EU Directive 2015/849 (AMLD)
  └── AFFECTS_PROCESS → AML/KYC Onboarding
```

The relation types are defined in `docs/relations/relation-types.md` and their JSON schema in `schemas/relation.schema.json`. When the analysis engine processes a new enforcement action, it creates relations using these types.

---

## 7. Branching strategy for ontology development

```
main (production — deployed to Pages)
 └── ontology/enforcement-actions   ← current priority branch
      ├── first: se.md + se.schema.json + example
      ├── then: no.md, dk.md, es.md
      └── merge to main when reviewed
```

Future branches follow the pattern: `ontology/<document-type>` (e.g., `ontology/guidelines`, `ontology/directives`).
