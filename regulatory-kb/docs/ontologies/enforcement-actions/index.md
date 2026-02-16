# Enforcement Actions

Enforcement actions are decisions by regulatory authorities imposing sanctions, fines, warnings, or corrective measures on supervised entities. They are the highest-priority document type for the horizon scan because they signal regulatory expectations and areas of focus.

## Why enforcement actions matter

An enforcement action tells you three things simultaneously:

1. **What went wrong** — the specific violations and their regulatory basis
2. **What the authority expects** — the standard of compliance implied by the action
3. **What to watch** — the regulatory areas and processes under active scrutiny

## Jurisdiction-specific ontologies

Each jurisdiction's enforcement actions follow a different structure, legal basis, and publication format. We maintain separate ontologies for each:

| Jurisdiction | Authority | Ontology | Schema | Example |
|---|---|---|---|---|
| Sweden | Finansinspektionen (FI) | [se.md](se.md) | [se.schema.json](schemas/se.schema.json) | [Example](examples/se-example-001.md) |
| Norway | Finanstilsynet | [no.md](no.md) | [no.schema.json](schemas/no.schema.json) | [Example](examples/no-example-001.md) |
| Denmark | Finanstilsynet (DK) | [dk.md](dk.md) | [dk.schema.json](schemas/dk.schema.json) | [Example](examples/dk-example-001.md) |
| Spain | CNMV / BdE | [es.md](es.md) | [es.schema.json](schemas/es.schema.json) | [Example](examples/es-example-001.md) |

## Common fields across jurisdictions

While structures differ, all enforcement action ontologies extract these core fields:

- **decision_date** — when the decision was issued
- **affected_entity** — the entity subject to the action
- **entity_type** — bank, insurance company, fund manager, etc.
- **fine_amount** — monetary penalty (if applicable)
- **affected_regulations** — national regulations cited
- **eu_regulation_mapping** — corresponding EU regulations
- **area_of_infringement** — the regulatory domain (AML, MiFID, Solvency, etc.)
- **affected_processes** — business processes implicated (onboarding, reporting, etc.)
- **severity** — classification of the enforcement action severity

## Inter-document relations

Enforcement actions generate the following [relation types](../relations/relation-types.md):

- `ENFORCES` → links to the national regulation(s) cited
- `IMPLEMENTS` → the EU regulation the national regulation transposes
- `AFFECTS_PROCESS` → the business process(es) implicated
- `ISSUED_BY` → the regulatory authority
- `TARGETS` → the supervised entity
