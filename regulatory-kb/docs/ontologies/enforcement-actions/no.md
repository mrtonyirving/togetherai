---
jurisdiction: "NO"
document_type: enforcement-action
authority: Finanstilsynet
authority_abbreviation: FT
language: "no"
version: "1.0"
last_updated: "2025-02-16"
source_url: https://www.finanstilsynet.no/tema/sanksjoner/
fields:
  - name: title
    type: string
    required: true
    description: Title of the enforcement action as published by Finanstilsynet

  - name: decision_date
    type: date
    required: true
    format: "YYYY-MM-DD"
    description: Date the decision was formally issued

  - name: reference_number
    type: string
    required: true
    description: Finanstilsynet's case reference number

  - name: affected_entity
    type: object
    required: true
    sub_fields:
      - name: name
        type: string
        required: true
      - name: org_number
        type: string
        required: false
        description: Norwegian organization number
        pattern: "\\d{9}"
      - name: entity_type
        type: enum
        required: true
        values: [bank, insurance_company, fund_manager, securities_company, payment_institution, e_money_institution, credit_institution, other]

  - name: decision_type
    type: enum
    required: true
    values: [fine, warning, revocation, order, public_notice, other]
    description: Type of enforcement action

  - name: fine_amount
    type: object
    required: false
    sub_fields:
      - name: amount
        type: number
        description: Fine amount in NOK
      - name: currency
        type: string
        default: NOK

  - name: summary
    type: string
    required: true
    description: Summary of the decision

  - name: affected_regulations
    type: array
    required: true
    description: Norwegian regulations cited
    items:
      type: object
      sub_fields:
        - name: regulation_id
          type: string
          description: "Norwegian regulation identifier (e.g., Forskrift 2018-09-04)"
        - name: regulation_name
          type: string
        - name: specific_provisions
          type: array
        - name: law_reference
          type: string
          description: "Parent law (e.g., Lov om hvitvasking)"

  - name: eu_regulation_mapping
    type: array
    required: false
    description: EU regulations that the cited Norwegian regulations implement
    items:
      type: object
      sub_fields:
        - name: eu_regulation_id
          type: string
        - name: eu_regulation_name
          type: string
        - name: relation_type
          type: enum
          values: [implements, supplements, amends]

  - name: area_of_infringement
    type: array
    required: true
    items:
      type: enum
      values: [aml_cft, mifid, solvency, insurance_distribution, payment_services, capital_requirements, governance, reporting, consumer_protection, market_abuse, other]

  - name: affected_processes
    type: array
    required: true
    items:
      type: string

  - name: severity
    type: enum
    required: true
    values: [critical, high, medium, low]

  - name: key_findings
    type: array
    required: true
    items:
      type: object
      sub_fields:
        - name: finding
          type: string
        - name: regulation_ref
          type: string
        - name: process_ref
          type: string

relations:
  - type: ENFORCES
    target_type: regulation
  - type: IMPLEMENTS
    target_type: eu_regulation
  - type: AFFECTS_PROCESS
    target_type: process
  - type: ISSUED_BY
    target_type: authority
    target: Finanstilsynet
  - type: TARGETS
    target_type: entity
---

# Norwegian Enforcement Actions — Ontology

## Authority

**Finanstilsynet** is Norway's financial supervisory authority. As an EEA member, Norway implements EU financial regulation through the EEA Agreement, meaning Norwegian enforcement actions reference both Norwegian law and underlying EU directives/regulations.

## Document structure

Norwegian enforcement actions from Finanstilsynet typically follow this structure:

### 1. Title and metadata

Published as a decision notice. The title format varies more than Swedish FI decisions.

### 2. Decision (Vedtak)

The formal decision section with the entity, action type, and any fine.

### 3. Background (Bakgrunn)

Context about the entity and the investigation that led to the action.

### 4. Legal basis (Rettslig grunnlag)

The applicable Norwegian laws and regulations. Key difference from Sweden: Norway implements EU directives through the EEA Agreement, so the chain is EU Directive → EEA Agreement → Norwegian Law.

### 5. Assessment (Finanstilsynets vurdering)

The substantive findings organized by topic area.

### 6. Sanction determination (Vurdering av sanksjoner)

Reasoning for the chosen enforcement measure.

## Key differences from Sweden

- Norway is EEA, not EU — regulations are transposed via the EEA Agreement
- Organization numbers are 9 digits without a hyphen (vs. Sweden's 6-4 format)
- Currency is NOK
- Regulation naming conventions differ (Norwegian forskrifter vs. Swedish FFFS)
- Finanstilsynet's publication format and structure can vary more between decisions

## Regulation mapping (NO → EU)

| Norwegian regulation | EU regulation |
|---|---|
| Hvitvaskingsloven (2018) | Directive 2015/849 (AMLD4) |
| Verdipapirhandelloven (2007) | Directive 2014/65/EU (MiFID II) |
| Finansforetaksloven (2015) | Various (CRD, Solvency II) |

## Severity classification

Uses the same criteria as the Swedish ontology, adjusted for NOK amounts. See [se.md](se.md) for the classification table — thresholds should be adjusted proportionally.

!!! note "TODO"
    Define NOK-specific severity thresholds.
