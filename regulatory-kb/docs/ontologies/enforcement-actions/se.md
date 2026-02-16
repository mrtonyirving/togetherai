---
jurisdiction: SE
document_type: enforcement-action
authority: Finansinspektionen
authority_abbreviation: FI
language: sv
version: "1.0"
last_updated: "2025-02-16"
source_url: https://www.fi.se/sv/publicerade-dokument/sanktioner/
fields:
  - name: title
    type: string
    required: true
    description: Title of the enforcement action as published by FI
    extraction: Direct from document header

  - name: decision_date
    type: date
    required: true
    format: "YYYY-MM-DD"
    description: Date the decision was formally issued
    extraction: From the decision section header or metadata

  - name: reference_number
    type: string
    required: true
    description: FI's internal reference number (diarienummer)
    pattern: "FI Dnr \\d{2}-\\d+"
    extraction: From document metadata or header

  - name: affected_entity
    type: object
    required: true
    description: The supervised entity subject to the enforcement action
    sub_fields:
      - name: name
        type: string
        required: true
        description: Legal name of the entity
      - name: org_number
        type: string
        required: false
        description: Swedish organizational number (organisationsnummer)
        pattern: "\\d{6}-\\d{4}"
      - name: entity_type
        type: enum
        required: true
        values: [bank, insurance_company, fund_manager, securities_company, payment_institution, e_money_institution, credit_market_company, other]
        description: Category of supervised entity
      - name: license_description
        type: string
        required: false
        description: Description of the entity's license/permission from FI

  - name: decision_type
    type: enum
    required: true
    values: [fine, warning, warning_with_fine, revocation, remark, injunction]
    description: Type of enforcement action taken
    extraction: From the decision section

  - name: fine_amount
    type: object
    required: false
    description: Monetary penalty details (null if no fine)
    sub_fields:
      - name: amount
        type: number
        description: Fine amount in SEK
      - name: currency
        type: string
        default: SEK

  - name: summary
    type: string
    required: true
    description: The summary section as published by FI. Typically follows the pattern "[Entity] is a [type]. They have a license to [activity]. FI has found that [violation]."
    extraction: From the "Sammanfattning" section

  - name: affected_regulations
    type: array
    required: true
    description: Swedish regulations cited as violated
    items:
      type: object
      sub_fields:
        - name: regulation_id
          type: string
          description: "FFFS number (e.g., FFFS 2017:11)"
        - name: regulation_name
          type: string
          description: Full name of the regulation
        - name: specific_provisions
          type: array
          description: "Specific chapters/sections cited (e.g., 3 kap. 1 §)"
        - name: law_reference
          type: string
          description: "Parent law if applicable (e.g., Lag (2017:630))"

  - name: eu_regulation_mapping
    type: array
    required: false
    description: EU regulations that the cited Swedish regulations implement
    items:
      type: object
      sub_fields:
        - name: eu_regulation_id
          type: string
          description: "EU regulation/directive identifier (e.g., Directive 2015/849)"
        - name: eu_regulation_name
          type: string
          description: Common name (e.g., AMLD4, MiFID II, Solvency II)
        - name: relation_type
          type: enum
          values: [implements, supplements, amends]

  - name: area_of_infringement
    type: array
    required: true
    description: Regulatory domains of the infringement
    items:
      type: enum
      values: [aml_cft, mifid, solvency, insurance_distribution, payment_services, capital_requirements, governance, reporting, consumer_protection, market_abuse, other]

  - name: affected_processes
    type: array
    required: true
    description: Business processes implicated by the enforcement action
    items:
      type: string
    examples: ["customer_due_diligence", "transaction_monitoring", "suspicious_activity_reporting", "risk_assessment", "internal_governance", "outsourcing", "product_governance", "complaints_handling", "capital_adequacy_reporting"]

  - name: severity
    type: enum
    required: true
    values: [critical, high, medium, low]
    description: Assessed severity based on fine amount, decision type, and systemic importance

  - name: key_findings
    type: array
    required: true
    description: Structured list of the main findings/violations
    items:
      type: object
      sub_fields:
        - name: finding
          type: string
          description: Description of the finding
        - name: regulation_ref
          type: string
          description: Specific regulation provision violated
        - name: process_ref
          type: string
          description: Business process this finding relates to

relations:
  - type: ENFORCES
    target_type: regulation
    description: Links this enforcement action to the Swedish regulation(s) cited
  - type: IMPLEMENTS
    target_type: eu_regulation
    description: Links the cited Swedish regulation to its EU parent
  - type: AFFECTS_PROCESS
    target_type: process
    description: Links to the business process(es) implicated
  - type: ISSUED_BY
    target_type: authority
    target: Finansinspektionen
  - type: TARGETS
    target_type: entity
    description: The supervised entity subject to the action
---

# Swedish Enforcement Actions — Ontology

## Authority

**Finansinspektionen (FI)** is Sweden's financial supervisory authority. FI publishes enforcement actions (sanktioner) on its website and in its regulatory database.

## Document structure

Swedish enforcement actions from FI follow a consistent structure:

### 1. Title

The title typically follows the format: **"[Decision type] mot [Entity name]"** (e.g., "Sanktionsavgift mot Exempelbanken AB").

### 2. Decision (Beslut)

Contains the formal decision: the entity affected, the type of action, and the fine amount (if applicable). This is the legally binding section.

### 3. Summary (Sammanfattning)

A structured paragraph that follows a predictable pattern:

> "[Entity name] är ett [entity type]. Bolaget har tillstånd att [licensed activities]. FI:s undersökning har visat att [entity] har brustit i [area of deficiency]."

Translation pattern: "[Entity] is a [type]. The company has a license to [activities]. FI's investigation has shown that [entity] has been deficient in [area]."

### 4. Background (Bakgrund)

Split into subsections:

- **a. Om [entity]** — About the entity: size, operations, market position
- **b. Undersökningen** — About the inspection: when it was conducted, scope, methodology

### 5. Regulatory framework (Rättslig reglering)

Overview of the applicable regulations. This section lays out the regulatory provisions that the entity is measured against. It typically covers:

- The primary Swedish law (e.g., Lag (2017:630) om åtgärder mot penningtvätt)
- FI's own regulations (FFFS)
- Any applicable EU regulation or directive

### 6. FI's assessment (FI:s bedömning)

The substantive analysis. Organized by area of infringement, each subsection addresses a specific finding. This is the most important section for our analysis engine — it contains the detailed reasoning.

### 7. Choice of sanction (Val av sanktion)

Why FI chose this particular enforcement measure and how the fine amount was determined. References the proportionality assessment.

## Field extraction notes

### Decision date

Found in the header metadata or the decision section. Format is always Swedish date format but should be normalized to ISO 8601 (`YYYY-MM-DD`).

### Entity type mapping

FI uses Swedish terms that map to our enum values:

| Swedish term | Enum value |
|---|---|
| Bank | `bank` |
| Försäkringsbolag | `insurance_company` |
| Fondbolag | `fund_manager` |
| Värdepappersbolag | `securities_company` |
| Betalningsinstitut | `payment_institution` |
| Institut för elektroniska pengar | `e_money_institution` |
| Kreditmarknadsbolag | `credit_market_company` |

### Affected regulations

Swedish financial regulations follow a naming convention: **FFFS [year]:[number]** for FI's own regulations, and **Lag ([year]:[number])** or **Förordning ([year]:[number])** for laws and ordinances.

### EU regulation mapping

Common mappings for Swedish financial regulation:

| Swedish regulation area | EU regulation |
|---|---|
| Lag (2017:630) om åtgärder mot penningtvätt | Directive 2015/849 (AMLD4) |
| FFFS 2017:11 | AMLD4 implementing measures |
| Lag (2007:528) om värdepappersmarknaden | Directive 2014/65/EU (MiFID II) |
| Lag (2015:1016) om resolution | Directive 2014/59/EU (BRRD) |
| Försäkringsrörelselagen (2010:2043) | Directive 2009/138/EC (Solvency II) |

### Affected processes

These are inferred from the findings, not always explicitly stated. The analysis engine maps findings to process categories based on the regulatory area and the specific provisions cited.

## Severity classification

| Severity | Criteria |
|---|---|
| Critical | License revocation, or fine > 50 MSEK, or systemic entity |
| High | Warning with fine > 10 MSEK |
| Medium | Warning with fine ≤ 10 MSEK, or warning without fine |
| Low | Remark (anmärkning) |
