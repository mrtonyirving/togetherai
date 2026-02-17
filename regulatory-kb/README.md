# Regulatory Knowledge Base

Markdown-first regulatory ontology workspace with generated inference relations.

## Start Here

- Domain taxonomy: [library/taxonomy/index_concepts.md](library/taxonomy/index_concepts.md)
- Technical docs: [technical/docs/index.md](technical/docs/index.md)

## Local development

```bash
npm install
npm run kb:build-all
```

## Build and validation

```bash
npm run kb:check
```

## Taxonomy inference workflow

```bash
# validate cross-document mapping integrity
npm run taxonomy:validate-links

# generate TypeScript relation tuples from markdown
npm run taxonomy:generate-relations

# generate Cypher MERGE statements from relation tuples
npm run kb:generate-cypher

# verify generated relations are equivalent to inference.ts behavior
npm run kb:verify-inference-equivalence
```

## Repository structure

| Directory | Purpose |
|---|---|
| `library/` | Markdown-only ontology source of truth |
| `technical/scripts/` | TypeScript validation/build scripts |
| `technical/artifacts/` | Generated machine artifacts |
| `public/artifacts/` | Published artifact mirror |

## How it works

Markdown tables in `library/ontologies/document-types/enforcement-actions/jurisdictions/se/enforcement-actions.md`
are parsed into schema and ontology artifacts under `technical/artifacts/`, then mirrored to `public/artifacts/`.

Taxonomy mappings in `library/taxonomy/AML/` are validated and transformed into:

- `library/taxonomy/generated/relations.generated.ts`
- `library/taxonomy/generated/inference.cypher`
