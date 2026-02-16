# Regulatory Knowledge Base

Ontologies, inter-document relations, and source registries for regulatory horizon scanning.

## Quick start

**View the docs**: [https://YOUR_ORG.github.io/regulatory-kb/](https://YOUR_ORG.github.io/regulatory-kb/)

**Edit content**: Navigate to any `.md` file in `docs/` and click the pencil icon in GitHub.

**Local preview**:

```bash
pip install -r requirements.txt
mkdocs serve
```

## Structure

| Directory | Purpose |
|---|---|
| `docs/ontologies/` | Ontology definitions by document type and jurisdiction |
| `docs/relations/` | Inter-document relation type definitions |
| `docs/jurisdictions/` | Jurisdiction profiles (authorities, legal frameworks) |
| `docs/sources/` | Registry of regulatory sources and their crawl configurations |
| `schemas/` | Shared JSON schemas |
| `scripts/` | Build and validation scripts |

## How it works

Every ontology file is a Markdown file with YAML frontmatter. The frontmatter is the structured, machine-readable contract consumed by crawlers and the analysis engine. The Markdown body is human-readable documentation for domain experts.

On push to `main`, two things happen:
1. MkDocs builds and deploys a readable site to GitHub Pages
2. A build script extracts all frontmatter into consolidated JSON files (available as GitHub Actions artifacts)
