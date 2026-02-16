---
# This is a FICTIONAL example for ontology development purposes.
# It demonstrates how a real enforcement action would be extracted using the SE ontology.

title: "Sanktionsavgift mot Exempelbanken AB"
decision_date: "2024-03-15"
reference_number: "FI Dnr 23-12345"

affected_entity:
  name: "Exempelbanken AB"
  org_number: "556123-4567"
  entity_type: bank
  license_description: "Tillstånd att bedriva bankrörelse enligt lagen (2004:297) om bank- och finansieringsrörelse"

decision_type: warning_with_fine

fine_amount:
  amount: 25000000
  currency: SEK

summary: >
  Exempelbanken AB är en bank med tillstånd att bedriva bankrörelse.
  Banken har cirka 50 000 kunder och en balansomslutning på cirka 30 miljarder kronor.
  FI:s undersökning har visat att Exempelbanken har brustit i sina skyldigheter
  avseende åtgärder mot penningtvätt och finansiering av terrorism.

affected_regulations:
  - regulation_id: "FFFS 2017:11"
    regulation_name: "Finansinspektionens föreskrifter om åtgärder mot penningtvätt och finansiering av terrorism"
    specific_provisions:
      - "3 kap. 1 §"
      - "3 kap. 3 §"
      - "5 kap. 1 §"
    law_reference: "Lag (2017:630) om åtgärder mot penningtvätt och finansiering av terrorism"

eu_regulation_mapping:
  - eu_regulation_id: "Directive 2015/849"
    eu_regulation_name: "AMLD4"
    relation_type: implements

area_of_infringement:
  - aml_cft

affected_processes:
  - customer_due_diligence
  - transaction_monitoring
  - risk_assessment

severity: high

key_findings:
  - finding: "Insufficient customer due diligence for high-risk customers. The bank did not obtain adequate information about the purpose and nature of business relationships."
    regulation_ref: "FFFS 2017:11, 3 kap. 1 §"
    process_ref: customer_due_diligence

  - finding: "Deficient transaction monitoring. The bank's automated monitoring system had thresholds set too high, missing a significant number of potentially suspicious transactions."
    regulation_ref: "FFFS 2017:11, 5 kap. 1 §"
    process_ref: transaction_monitoring

  - finding: "Inadequate general risk assessment. The bank's AML/CFT risk assessment did not adequately consider the risks associated with certain customer segments and geographies."
    regulation_ref: "FFFS 2017:11, 3 kap. 3 §"
    process_ref: risk_assessment

relations_extracted:
  - source: "FI-2024-EX001"
    type: ENFORCES
    target: "FFFS 2017:11"
    target_type: regulation

  - source: "FI-2024-EX001"
    type: ENFORCES
    target: "Lag (2017:630)"
    target_type: regulation

  - source: "FFFS 2017:11"
    type: IMPLEMENTS
    target: "Directive 2015/849"
    target_type: eu_regulation

  - source: "FI-2024-EX001"
    type: AFFECTS_PROCESS
    target: customer_due_diligence
    target_type: process

  - source: "FI-2024-EX001"
    type: AFFECTS_PROCESS
    target: transaction_monitoring
    target_type: process

  - source: "FI-2024-EX001"
    type: AFFECTS_PROCESS
    target: risk_assessment
    target_type: process
---

# Example: Sanktionsavgift mot Exempelbanken AB

!!! warning "Fictional example"
    This is a **fictional** enforcement action created for ontology development and testing purposes. It demonstrates the expected extraction output for a Swedish enforcement action in the AML/CFT domain.

## What this example demonstrates

This example shows:

1. **Full field extraction** — every field in the SE ontology is populated
2. **Regulation chain** — Swedish FFFS → Swedish law → EU directive
3. **Multi-finding structure** — three separate findings, each tied to a regulation provision and business process
4. **Relation extraction** — six relations generated from a single enforcement action
5. **Severity classification** — "high" based on warning + fine of 25 MSEK

## Extraction notes

### Entity identification

The entity name, org number, and entity type come from the summary section. The license description comes from the background section.

### Regulation parsing

FFFS references follow the pattern `FFFS [year]:[number]`. Specific provisions use Swedish legal citation format: `[chapter] kap. [section] §`.

### Finding-to-process mapping

Each finding maps to exactly one business process. The mapping is based on the regulation provision cited and the nature of the deficiency described.

### Relation generation

From this single enforcement action, we generate:

- 2 × `ENFORCES` (one for FFFS, one for the parent law)
- 1 × `IMPLEMENTS` (FFFS → EU directive)
- 3 × `AFFECTS_PROCESS` (one per finding)

These relations enable navigation from this enforcement action to the affected regulations, up to EU level, and across to the business processes that need attention.
