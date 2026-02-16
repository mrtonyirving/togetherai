---
type: relation-types
version: "1.0"
last_updated: "2025-02-16"
relation_types:
  - name: ENFORCES
    source_types: [enforcement-action]
    target_types: [regulation]
    description: The enforcement action cites this regulation as violated
    cardinality: many-to-many

  - name: IMPLEMENTS
    source_types: [regulation]
    target_types: [eu_regulation, directive]
    description: The national regulation transposes or implements this EU instrument
    cardinality: many-to-many

  - name: AMENDS
    source_types: [regulation, directive]
    target_types: [regulation, directive]
    description: This instrument amends the target instrument
    cardinality: many-to-many

  - name: SUPPLEMENTS
    source_types: [regulation, guideline]
    target_types: [regulation, directive]
    description: This instrument supplements the target with additional requirements
    cardinality: many-to-many

  - name: REPEALS
    source_types: [regulation, directive]
    target_types: [regulation, directive]
    description: This instrument repeals and replaces the target
    cardinality: one-to-one

  - name: REFERENCES
    source_types: [enforcement-action, guideline, regulation, directive]
    target_types: [enforcement-action, guideline, regulation, directive]
    description: Generic reference from one document to another
    cardinality: many-to-many

  - name: AFFECTS_PROCESS
    source_types: [enforcement-action, guideline, regulation]
    target_types: [process]
    description: This document is relevant to the specified business process
    cardinality: many-to-many

  - name: ISSUED_BY
    source_types: [enforcement-action, guideline, regulation]
    target_types: [authority]
    description: The regulatory authority that issued this document
    cardinality: many-to-one

  - name: TARGETS
    source_types: [enforcement-action]
    target_types: [entity]
    description: The supervised entity subject to this enforcement action
    cardinality: many-to-one

  - name: SUPERSEDES
    source_types: [guideline, regulation]
    target_types: [guideline, regulation]
    description: This document replaces an older version of the same instrument
    cardinality: one-to-one
---

# Relation Types

This is the canonical catalogue of all relation types used in the knowledge base.

## Regulatory chain relations

These relations model the hierarchy from enforcement actions down to EU law:

| Type | From | To | Meaning |
|---|---|---|---|
| `ENFORCES` | Enforcement action | Regulation | The action cites this regulation as violated |
| `IMPLEMENTS` | National regulation | EU regulation/directive | National law transposes the EU instrument |
| `AMENDS` | Regulation/directive | Regulation/directive | Modifies the target instrument |
| `SUPPLEMENTS` | Regulation/guideline | Regulation/directive | Adds to the target's requirements |
| `REPEALS` | Regulation/directive | Regulation/directive | Replaces the target entirely |
| `SUPERSEDES` | Guideline/regulation | Guideline/regulation | Newer version of the same instrument |
| `REFERENCES` | Any document | Any document | Generic cross-reference |

## Entity and process relations

| Type | From | To | Meaning |
|---|---|---|---|
| `AFFECTS_PROCESS` | Enforcement action / guideline / regulation | Process | Relevant to this business process |
| `ISSUED_BY` | Any regulatory document | Authority | The issuing authority |
| `TARGETS` | Enforcement action | Entity | The supervised entity affected |

## Usage in the analysis engine

When a new enforcement action is ingested, the analysis engine:

1. Extracts `ENFORCES` relations to all cited regulations
2. Looks up existing `IMPLEMENTS` relations to find the EU-level mapping
3. Infers `AFFECTS_PROCESS` relations from the key findings
4. Creates `ISSUED_BY` and `TARGETS` relations from the entity and authority metadata

This generates the full relation graph for navigation.
