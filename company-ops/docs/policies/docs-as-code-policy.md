---
title: "Docs-as-Code Policy"
owner: "@ops-lead"
status: "active"
last_reviewed: "2026-02-15"
tags: ["area:ops", "type:policy"]
related: []
---

# Docs-as-Code Policy

## Purpose

Keep operational knowledge maintainable, reviewable, and close to execution.

## What Belongs in GitHub

- Product specs, RFCs, ADRs, runbooks, postmortems.
- Planning docs, weekly updates, meeting notes with decisions.
- Company policies and onboarding checklists.
- Hiring scorecards and customer insight summaries.

## What Does Not Belong in GitHub

- Secrets, passwords, keys, tokens, private certificates.
- Raw regulated data (PII/PHI/financial records).
- Vendor contracts requiring legal confidentiality controls (store in approved legal system, link reference only).

## Change Control

- Important docs require PR review.
- Minor edits can be fast-tracked but must preserve ownership and review dates.
- All major decisions must be linked to an issue and/or PR.

## Freshness Policy

- RFCs/PRDs reviewed every 45 days while active.
- Policies/runbooks reviewed every 90 days.
- Stale docs are flagged automatically via workflow.
