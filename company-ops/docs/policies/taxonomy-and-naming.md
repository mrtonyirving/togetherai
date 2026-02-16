---
title: "Taxonomy and Naming"
owner: "@ops-lead"
status: "active"
last_reviewed: "2026-02-15"
tags: ["area:ops", "type:policy"]
related: []
---

# Taxonomy and Naming

## Folder Taxonomy

- `docs/company` - handbook and company operating norms.
- `docs/onboarding` - onboarding docs/checklists.
- `docs/product` - PRDs/specs.
- `docs/architecture` - RFCs and ADRs.
- `docs/runbooks` - operational procedures and incident docs.
- `docs/meetings` - meeting notes and weekly updates.
- `docs/planning` - roadmaps, OKRs, planning metadata.
- `docs/hiring` - role scorecards/interview docs.
- `docs/customers` - customer insights/feedback.
- `docs/security` - security/access/incident policy.
- `docs/decisions` - non-ADR decision logs.
- `docs/templates` - reusable templates.

## File Naming Conventions

- Time-based docs: `YYYY-MM-DD-slug.md`.
- ADRs: `ADR-XXXX-slug.md`.
- PRDs include `PRD-XXXX` in title/frontmatter.
- RFCs include `RFC-XXXX` in title/frontmatter.

## Required Tags

Use frontmatter `tags` to improve findability:

- Area tags: `area:product`, `area:engineering`, `area:ops`, `area:security`, `area:customers`, `area:hiring`.
- Type tags: `type:prd`, `type:rfc`, `type:adr`, `type:runbook`, `type:incident`, `type:meeting`, `type:okr`, `type:decision`.

## Global Search Strategy

1. Search by ID first (`ADR-`, `RFC-`, `PRD-`).
2. Search by path scope (`docs/security`, `docs/product/prds`).
3. Search by tags and owner handle.
4. Use generated index (`docs/_index.generated.md`) for broad discovery.

## Allowed Status Values

- `draft`
- `active`
- `deprecated`
- `archived`
