---
name: update-paths
description: Regenerate compass/paths.md for this repository from tracked paths. Use when files or directories are added, removed, or renamed and the full path inventory must be refreshed. This skill updates compass/paths.md only.
---

# Update Paths

Regenerate `/Users/aran.berzingi/togetherai/regulatory-kb/compass/paths.md` only.

## Steps

1. Run from `/Users/aran.berzingi/togetherai/regulatory-kb`.
2. Execute:

```bash
npm run compass:update-paths
```

3. Verify that only `/Users/aran.berzingi/togetherai/regulatory-kb/compass/paths.md` changed.
4. Summarize what changed in:
- directory count and entries
- file count and entries

## Guardrails

- Do not run `npm run compass:update-all`.
- Do not edit `/Users/aran.berzingi/togetherai/regulatory-kb/compass/index.md`.
- Keep output deterministic and script-generated.
