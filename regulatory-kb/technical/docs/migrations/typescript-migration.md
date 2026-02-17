# TypeScript Migration

This repository moved from legacy runtime scripts to Node + TypeScript pipeline scripts.

## Core commands

- `npm run kb:validate`
- `npm run kb:sync-schemas`
- `npm run kb:build-graph`
- `npm run kb:build-json`
- `npm run kb:manifest`
- `npm run kb:build-all`
- `npm run kb:check`

## Current generated paths

- `technical/artifacts/ontologies/enforcement-actions.json`
- `technical/artifacts/relations/relation-types.json`
- `technical/artifacts/relations/relation-aliases.json`
- `technical/artifacts/relations/graph.json`
- `technical/artifacts/relations/mappings/*.json`
- `technical/artifacts/sources/index.json`
- `technical/artifacts/manifest.json`

`npm run kb:build-all` regenerates these and publishes a site-served copy to `public/artifacts/`.
