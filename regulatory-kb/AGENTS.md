# AGENTS.md instructions for /Users/aran.berzingi/togetherai/regulatory-kb

## Skills
A skill is a reusable instruction set stored in a `SKILL.md` file.

### Available skills
- update-compass: Regenerate `/Users/aran.berzingi/togetherai/regulatory-kb/technical/docs/compass/index.md` from tracked repository paths. Use when repo structure or top-level navigation changes. (file: /Users/aran.berzingi/togetherai/regulatory-kb/.codex/skills/update-compass/SKILL.md)
- update-paths: Regenerate `/Users/aran.berzingi/togetherai/regulatory-kb/technical/docs/compass/paths.md` with all tracked directories and files. Use when files or folders are added, removed, or renamed. (file: /Users/aran.berzingi/togetherai/regulatory-kb/.codex/skills/update-paths/SKILL.md)

### How to use skills
- Trigger `update-compass` for compass-index refreshes only.
- Trigger `update-paths` for full tracked-path inventory refreshes only.
- Run the script named in each skill and avoid combining responsibilities.
