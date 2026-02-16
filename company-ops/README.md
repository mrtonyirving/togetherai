# Company Ops (GitHub Operating System)

This repository is the operating system for internal knowledge, planning, and decisions.

It is designed for a small cross-functional startup (2–15 people now) and scales to larger teams by keeping governance lightweight:

- Markdown-first docs.
- GitHub Issues for intake.
- GitHub Projects for planning.
- Pull requests for important changes.
- CODEOWNERS for review routing.
- GitHub Actions for quality and freshness checks.

## How This Repository Works

1. Open an issue using a template (`bug`, `feature`, `task`, `decision`, `incident`).
2. Triage into the Project board with owner, priority, and area.
3. Create or update docs in `docs/` using templates in `docs/templates/`.
4. Open a PR with the docs checklist.
5. Merge after required owners review.

## Core Rules

- Keep docs close to decisions and execution.
- Use the templates unless there is a strong reason not to.
- Update section indexes when you add new docs.
- Do not store secrets, credentials, or regulated raw data here.
- Prefer short, dated updates over perfect but stale docs.

## Repository Layout

- `docs/` - handbook, policies, onboarding, product specs, architecture, runbooks, planning, hiring, customer insights.
- `.github/` - issue templates, PR template, CODEOWNERS, workflows.
- `scripts/docs/` - index checks, index generation, stale-doc scanning.

## Get Started

- Start at `/docs/start-here.md`.
- Use `/docs/README.md` as the navigation hub.
- Read `/CONTRIBUTING.md` before your first PR.

## Defaults

- Default branch: `main`.
- Naming for time-based docs: `YYYY-MM-DD-slug.md`.
- ADR naming: `ADR-XXXX-slug.md`.
- Required frontmatter fields: `title`, `owner`, `status`, `last_reviewed`, `tags`, `related`.
