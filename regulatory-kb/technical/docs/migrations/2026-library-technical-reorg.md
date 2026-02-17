# 2026 Library/Technical Reorganization

This migration introduced a strict split between domain and technical assets.

## What changed

- Domain source-of-truth moved from `docs/` to `library/`
- Engineering code/assets moved into `technical/`
- Canonical artifacts moved to `technical/artifacts/`
- Site-served artifact mirror moved to `public/artifacts/`
- Ontology layout changed to:
  - `library/ontologies/document-types/{document-type}/model.md`
  - `library/ontologies/jurisdictions/{jurisdiction}/{document-type}.md`

## Key path mapping

| Old | New |
|---|---|
| `docs/**` | `library/**` |
| `scripts/**` | `technical/scripts/**` |
| `schemas/**` | `technical/schemas/**` |
| `artifacts/**` | `technical/artifacts/**` |
| `compass/**` | `technical/docs/compass/**` |
| `docs/public/artifacts/**` | `public/artifacts/**` |

## Command behavior after cutover

- `npm run kb:*` scripts execute from `technical/scripts/*`
- Documentation is maintained as Markdown under `library/**` and `technical/docs/**`

## CI updates

- Validate workflow watches: `library/**`, `technical/**`, `public/**`
- Deploy workflow uploads: `technical/artifacts/`
