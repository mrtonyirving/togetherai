---
jurisdiction: ES
document_type: enforcement-action
authority: CNMV / Banco de España
authority_abbreviation: CNMV/BdE
language: es
version: "1.0"
last_updated: "2025-02-16"
source_url_cnmv: https://www.cnmv.es/portal/Sanciones-Recursos/Sanciones.aspx
source_url_bde: https://www.bde.es/wbe/es/entidades-profesionales/registro-entidades/sanciones/
fields:
  - name: title
    type: string
    required: true
    description: Title of the enforcement action

  - name: decision_date
    type: date
    required: true
    format: "YYYY-MM-DD"

  - name: reference_number
    type: string
    required: true
    description: Expediente number

  - name: issuing_authority
    type: enum
    required: true
    values: [CNMV, BdE, DGSFP]
    description: "Which Spanish authority issued the action. CNMV (securities), BdE (banking), DGSFP (insurance/pensions)"

  - name: affected_entity
    type: object
    required: true
    sub_fields:
      - name: name
        type: string
        required: true
      - name: cif_number
        type: string
        required: false
        description: Spanish tax identification number (CIF/NIF)
      - name: entity_type
        type: enum
        required: true
        values: [bank, insurance_company, fund_manager, securities_company, payment_institution, credit_institution, pension_fund, other]

  - name: decision_type
    type: enum
    required: true
    values: [fine, warning, public_reprimand, suspension, revocation, prohibition, other]
    description: "Spanish enforcement actions classify infractions as very serious (muy graves), serious (graves), or minor (leves)"

  - name: infraction_severity
    type: enum
    required: true
    values: [muy_grave, grave, leve]
    description: Spanish legal classification of the infraction

  - name: fine_amount
    type: object
    required: false
    sub_fields:
      - name: amount
        type: number
        description: Fine amount in EUR
      - name: currency
        type: string
        default: EUR

  - name: summary
    type: string
    required: true

  - name: affected_regulations
    type: array
    required: true
    description: Spanish regulations cited
    items:
      type: object
      sub_fields:
        - name: regulation_id
          type: string
          description: "Spanish law identifier (e.g., Ley 10/2010, Real Decreto 304/2014)"
        - name: regulation_name
          type: string
        - name: specific_provisions
          type: array
          description: "Specific articles cited (e.g., artículo 26)"

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
  - type: TARGETS
    target_type: entity
---

# Spanish Enforcement Actions — Ontology

## Authorities

Spain has multiple financial supervisory authorities, each covering a different domain:

- **CNMV (Comisión Nacional del Mercado de Valores)** — Securities markets, investment firms, fund managers
- **Banco de España (BdE)** — Banks, credit institutions, payment institutions
- **DGSFP (Dirección General de Seguros y Fondos de Pensiones)** — Insurance companies, pension funds

Each authority publishes its own enforcement actions. The ontology covers all three but the `issuing_authority` field distinguishes them.

## Document structure

Spanish enforcement actions follow a more formal legal structure than Nordic countries:

### 1. Header (Encabezamiento)

Identifies the expediente (case file), the authority, and the entity.

### 2. Facts proven (Hechos probados)

Detailed factual findings, typically numbered. This is more formally structured than Nordic equivalents.

### 3. Legal basis (Fundamentos de derecho)

Extensive legal reasoning citing specific articles of Spanish law. Spain tends to provide more granular legal citations.

### 4. Infraction classification (Calificación de la infracción)

Infractions are formally classified under Spanish law as:

- **Muy grave** (very serious) — the most severe, can result in license revocation
- **Grave** (serious) — significant fines
- **Leve** (minor) — lighter penalties

This classification is a distinguishing feature of Spanish enforcement actions and does not have a direct equivalent in the Nordic jurisdictions.

### 5. Sanction (Sanción)

The penalty imposed, with reasoning for the amount.

### 6. Appeals (Recursos)

Information about how the entity can appeal the decision.

## Key differences from Nordic jurisdictions

- Multiple authorities (CNMV, BdE, DGSFP) vs. a single supervisor
- Formal infraction severity classification (muy grave / grave / leve)
- More legalistic document structure with numbered facts and detailed legal reasoning
- Spain is an EU member — direct transposition
- Currency is EUR (unlike the Nordic countries)
- Entity identifier is CIF/NIF (tax ID)
- Spanish enforcement actions often include more explicit appeals information

## Regulation mapping (ES → EU)

| Spanish regulation | EU regulation |
|---|---|
| Ley 10/2010 (Prevención del blanqueo de capitales) | Directive 2015/849 (AMLD4) |
| Real Decreto Legislativo 4/2015 (Ley del Mercado de Valores) | Directive 2014/65/EU (MiFID II) |
| Ley 20/2015 (Ordenación, supervisión y solvencia de entidades aseguradoras) | Directive 2009/138/EC (Solvency II) |

## Severity classification

Spanish enforcement actions already come with a built-in severity classification (muy grave / grave / leve). Our internal severity mapping:

| Internal severity | Spanish classification | Additional criteria |
|---|---|---|
| Critical | Muy grave | + license revocation or fine > €5M |
| High | Muy grave | Fine ≤ €5M |
| Medium | Grave | Any |
| Low | Leve | Any |
