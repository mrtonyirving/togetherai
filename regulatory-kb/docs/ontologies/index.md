# Ontologies

An ontology defines the structure and semantics of a specific type of regulatory document in a specific jurisdiction. It answers: *what fields does this document type contain, what are their types, and what do they mean?*

## Structure of an ontology file

Every ontology file has two parts:

### YAML frontmatter (machine-readable)

```yaml
---
jurisdiction: SE
document_type: enforcement-action
authority: Finansinspektionen
version: "1.0"
fields:
  - name: decision_date
    type: date
    required: true
    description: Date the decision was issued
---
```

This frontmatter is extracted by the build pipeline and consumed by crawlers and the analysis engine.

### Markdown body (human-readable)

The body contains detailed descriptions of each field, structural notes about how the document type is organized, and guidance for domain experts on how to interpret and extend the ontology.

## Ontology types

| Document type | Description | Status |
|---|---|---|
| [Enforcement actions](enforcement-actions/index.md) | Sanctions, fines, corrective measures | In development |
| [Guidelines](guidelines/index.md) | Non-binding authority guidance | Planned |
| [Directives](directives/index.md) | EU directives and transpositions | Planned |
| [Regulations](regulations/index.md) | Binding regulatory instruments | Planned |

## How to create a new ontology

1. Identify the jurisdiction and document type
2. Copy the closest existing ontology file as a template
3. Update the frontmatter fields to match the document structure
4. Write the Markdown body with field descriptions and examples
5. Add a JSON schema in the `schemas/` subdirectory
6. Add at least one annotated example in the `examples/` subdirectory
