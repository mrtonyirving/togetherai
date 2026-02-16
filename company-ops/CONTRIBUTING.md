# Contributing to Company Ops

## Goal

Keep internal knowledge current, searchable, and actionable.

## What to Change Through PRs

Use PRs for any change that affects behavior, policy, decisions, onboarding, architecture, or runbooks.

Examples:

- New PRD/RFC/ADR.
- Policy edits.
- Runbook changes.
- Incident postmortems.
- Roadmap and planning updates.

## Fast Path for Small Updates

For typo fixes or minor clarifications:

1. Open a `task` issue or small PR.
2. Update the doc.
3. Add a one-line changelog note in the PR description.

## New Doc Flow

1. Pick the right template from `docs/templates/`.
2. Create the doc in the matching folder under `docs/`.
3. Name it with conventions from `docs/policies/taxonomy-and-naming.md`.
4. Add a link in that folder's `README.md` index.
5. Open a PR and complete the checklist.

## Required Frontmatter

All non-trivial docs should include frontmatter:

```yaml
---
title: "<title>"
owner: "@handle-or-team"
status: "draft|active|deprecated|archived"
last_reviewed: "YYYY-MM-DD"
tags: ["area:...", "type:..."]
related: ["#123", "PRD-0001", "RFC-0002"]
---
```

## Review Expectations

- Follow CODEOWNERS rules.
- Security, runbooks, architecture, and policy docs need owner review.
- If scope changes, update docs in the same PR or justify why not.

## Docs Definition of Done

A docs-impacting PR is done only when:

- The content is accurate and actionable.
- Owner and `last_reviewed` are set.
- Section index is updated.
- Links render and markdown lint passes.
