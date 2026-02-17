# Repository Boundaries

This repository enforces strict separation between domain and technical assets.

## Domain boundary

All domain-expert source-of-truth files are under `library/`.

- Ontologies
- Relations
- Jurisdictions
- Sources
- Domain contribution docs

## Technical boundary

All implementation and generated assets are under `technical/`.

- TypeScript build and validation scripts
- Static and reference schemas
- Generated machine artifacts
- Engineering documentation and path inventory

## Published artifacts

- Canonical generated output: `technical/artifacts/**`
- Site-served mirror: `public/artifacts/**`

## Ownership model

- Domain experts own and review `library/**`
- Engineers own and review `technical/**` and workflow automation under `.github/workflows/**`
