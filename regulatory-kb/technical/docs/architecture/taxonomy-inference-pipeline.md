# Taxonomy Inference Pipeline

This pipeline converts strict markdown mappings into deterministic TypeScript relation tuples and Cypher MERGE statements.

## Source-of-truth

- `library/taxonomy/AML/concepts/**`
- `library/taxonomy/AML/map/Sweden/**`
- `library/ontologies/document-types/enforcement-actions/jurisdictions/se/examples/enforcement-actions/**`

## Contracts

- Canonical statutory reference format (normalized internal/output): `SE,RD,2017:630,kX[,pY[,sZ[,ptW]]]`
- Concept `## references` input accepts either:
  - canonical bullets, e.g. `- SE,RD,2017:630,k1,p1`
  - Sweden structured blocks, e.g. `Sweden:` with `Law`, `Kapitel`/`Chapter`, optional `Paragraph`/`Paragraf`, optional `Stycke`, optional `Punkt`
- Concept IDs and slugs are canonicalized to ASCII `snake_case`, e.g. `general_risk_assessment`
- Input concept identifiers may include mixed casing, spaces, or punctuation; parser normalizes them before validation/comparison
- Empty values are invalid in machine sections; omit non-applicable keys.

## Commands

- Validate mappings: `npm run taxonomy:validate-links`
- Generate tuple module: `npm run taxonomy:generate-relations`
- Generate Cypher: `npm run kb:generate-cypher`
- Equivalence check: `npm run kb:verify-inference-equivalence`

## Outputs

- `library/taxonomy/generated/relations.generated.ts`
- `library/taxonomy/generated/inference.cypher`

## Scaffolding

Use `npm run taxonomy:scaffold -- <concept|provision|enforcement-action>` to create files from templates and update taxonomy index files.

The scaffold CLI uses interactive arrow-key menus for repository-backed fields (for example jurisdictions, laws, statutory levels, concept slugs, and topic concept IDs). Each catalog-backed question includes a `Custom...` fallback so operators can enter new values when needed. Fields without meaningful repository catalogs remain free-text inputs.
