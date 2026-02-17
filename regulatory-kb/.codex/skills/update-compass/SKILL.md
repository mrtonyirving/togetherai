---
name: update-compass
description: Regenerate compass/index.md for this repository from tracked paths. Use when repository structure, top-level grouping, or compass navigation summaries must be refreshed after file or folder changes. This skill updates compass/index.md only.
---

# Update Compass

Regenerate `/Users/aran.berzingi/togetherai/regulatory-kb/compass/index.md` only.

## Steps

1. Run from `/Users/aran.berzingi/togetherai/regulatory-kb`.
2. Execute:

```bash
npm run compass:update-index
```

3. Verify that only `/Users/aran.berzingi/togetherai/regulatory-kb/compass/index.md` changed.
4. Summarize what changed in:
- root table counts
- quick navigation links
- root section direct children

## Guardrails

- Do not run `npm run compass:update-all`.
- Do not edit `/Users/aran.berzingi/togetherai/regulatory-kb/compass/paths.md`.
- Keep output deterministic and script-generated.
