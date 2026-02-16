# Start Here

Welcome. This repository is your default source for internal operating knowledge.

## First 30 Minutes

1. Read [Docs Index](./README.md).
2. Read [Taxonomy and Naming](./policies/taxonomy-and-naming.md).
3. Read [Docs-as-Code Policy](./policies/docs-as-code-policy.md).
4. Open one recent PR to see the docs checklist in action.

## Where New Work Goes

- Need a plan/spec: `docs/product/` using PRD or RFC templates.
- Need technical decision: `docs/architecture/adrs/` using ADR template.
- Need operational procedure: `docs/runbooks/` using runbook template.
- Need weekly/company status: `docs/meetings/` or `docs/planning/`.

## How to Name Things

- Time-based docs: `YYYY-MM-DD-slug.md`.
- ADRs: `ADR-XXXX-slug.md`.
- Use clear slugs (`incident-api-timeout`, `weekly-update`, `customer-insight-acme`).

## How to Find Things Fast

- Search by path first (`docs/security`, `docs/product/prds`, `docs/architecture/adrs`).
- Search by IDs (`PRD-`, `RFC-`, `ADR-`).
- Search by tags in frontmatter (`area:product`, `type:incident`).

## Defaults

- If unsure, choose the smallest template and start with `status: draft`.
- If a decision is needed, open a `decision` issue and link your doc.
