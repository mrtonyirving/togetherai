# Regulatory Knowledge Base

Welcome to the knowledge base powering the regulatory horizon scan. This site contains all ontology definitions, inter-document relation types, jurisdiction profiles, and source registries.

## How to use this site

**Domain experts**: Browse the sections in the left sidebar. To edit any page, click the pencil icon at the top right of the page — this will open the file in GitHub where you can make changes directly.

**Engineers**: The machine-readable version of every ontology is available as JSON. The `build_json.py` script extracts YAML frontmatter from all Markdown files and produces consolidated JSON files. These are built automatically on push to `main` and available as GitHub Actions artifacts.

## Document types

We maintain ontologies for four types of regulatory documents:

- **Enforcement actions** — Sanctions, fines, and corrective measures imposed by regulatory authorities
- **Guidelines** — Non-binding guidance issued by regulatory authorities
- **Directives** — EU directives and their national transpositions
- **Regulations** — Binding regulatory instruments at national and EU level

## Jurisdictions

Currently covered: Sweden (SE), Norway (NO), Denmark (DK), Spain (ES), and the EU.

## Getting started

Start with [Ontologies](ontologies/index.md) to understand how we model regulatory documents, or jump directly to [Enforcement Actions](ontologies/enforcement-actions/index.md) for the most developed ontology set.
