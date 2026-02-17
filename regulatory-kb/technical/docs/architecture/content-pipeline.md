# Content Pipeline

The pipeline converts markdown ontology tables in `library/` into machine-readable outputs under `technical/artifacts/`.

Taxonomy mappings also drive inference generation under `library/taxonomy/generated/` via dedicated `taxonomy:*` scripts.

## Pipeline stages

1. `kb:validate`
Validates the Sweden enforcement ontology and its markdown examples.

2. `kb:sync-schemas`
Builds `technical/artifacts/schemas/enforcement-actions/se.schema.json` from ontology markdown.

3. `kb:build-json`
Builds ontology index artifacts and prunes removed artifact scopes.

4. `kb:manifest`
Builds a manifest for generated artifact files.

5. `kb:publish-artifacts`
Copies `technical/artifacts/` to `public/artifacts/`.

## End-to-end commands

- Full regeneration: `npm run kb:build-all`
- Drift checks: `npm run kb:check`
