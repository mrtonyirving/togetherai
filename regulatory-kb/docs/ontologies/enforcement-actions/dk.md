---
jurisdiction: DK
document_type: enforcement-action
authority: Finanstilsynet
authority_abbreviation: DFSA
language: da
version: "1.0"
last_updated: "2025-02-16"
source_url: https://www.finanstilsynet.dk/afgorelser
fields:
  - name: title
    type: string
    required: true
    description: Title of the enforcement action as published by the Danish FSA

  - name: decision_date
    type: date
    required: true
    format: "YYYY-MM-DD"

  - name: reference_number
    type: string
    required: true
    description: Danish FSA case reference number (journalnummer)

  - name: affected_entity
    type: object
    required: true
    sub_fields:
      - name: name
        type: string
        required: true
      - name: cvr_number
        type: string
        required: false
        description: Danish Central Business Register number (CVR)
        pattern: "\\d{8}"
      - name: entity_type
        type: enum
        required: true
        values: [bank, insurance_company, fund_manager, securities_dealer, payment_institution, e_money_institution, mortgage_credit_institution, pension_fund, other]

  - name: decision_type
    type: enum
    required: true
    values: [fine, order, warning, reprimand, revocation, public_censure, other]
    description: Type of enforcement action

  - name: fine_amount
    type: object
    required: false
    sub_fields:
      - name: amount
        type: number
        description: Fine amount in DKK
      - name: currency
        type: string
        default: DKK

  - name: summary
    type: string
    required: true

  - name: affected_regulations
    type: array
    required: true
    description: Danish regulations cited
    items:
      type: object
      sub_fields:
        - name: regulation_id
          type: string
          description: "Danish law identifier (e.g., Lov nr. 1155 af 08/06/2021)"
        - name: regulation_name
          type: string
        - name: specific_provisions
          type: array
        - name: bekendtgoerelse_ref
          type: string
          description: "Executive order reference if applicable"

  - name: eu_regulation_mapping
    type: array
    required: false
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
    target: Finanstilsynet (DK)
  - type: TARGETS
    target_type: entity
---

# Danish Enforcement Actions — Ontology

## Authority

The **Danish Financial Supervisory Authority (Finanstilsynet / DFSA)** supervises financial institutions in Denmark. Denmark is an EU member state, so Danish financial regulation directly transposes EU directives.

## Document structure

Danish enforcement actions (afgørelser) typically follow this structure:

### 1. Title and metadata

Published on the DFSA decisions page. Titles tend to name the entity and the nature of the decision.

### 2. Decision (Afgørelse)

The formal decision with the entity, action type, and penalty.

### 3. Description of the case (Sagsfremstilling)

Background on the entity and the supervisory process.

### 4. Legal framework (Retsgrundlag)

Applicable Danish laws, executive orders (bekendtgørelser), and EU regulations.

### 5. DFSA's assessment (Finanstilsynets vurdering)

Detailed findings organized by area.

### 6. Decision reasoning (Begrundelse for afgørelsen)

Why the chosen action was appropriate.

## Key differences from Sweden and Norway

- Denmark is an EU member — direct transposition of EU directives (no EEA intermediate step)
- Business identifier is the CVR number (8 digits)
- Currency is DKK
- Danish regulation uses "bekendtgørelser" (executive orders) as the equivalent of Swedish FFFS
- The DFSA also handles pension fund supervision more prominently

## Regulation mapping (DK → EU)

| Danish regulation | EU regulation |
|---|---|
| Hvidvaskloven (Lov om forebyggende foranstaltninger mod hvidvask) | Directive 2015/849 (AMLD4) |
| Lov om kapitalmarkeder | Directive 2014/65/EU (MiFID II) |
| Lov om finansiel virksomhed | Various (CRD, Solvency II) |

## Severity classification

!!! note "TODO"
    Define DKK-specific severity thresholds.
