# Relations

Relations are typed, directional links between regulatory documents, entities, processes, and authorities. They are the backbone of inter- and intra-document navigation in the horizon scan.

## How relations work

A relation connects a **source** to a **target** with a specific **type**:

```
[Source Document] --RELATION_TYPE--> [Target Document/Entity]
```

For example, when a Swedish enforcement action cites a regulation that implements an EU directive:

```
FI Enforcement Action FI-2024-001
  ├── ENFORCES ──→ FFFS 2017:11
  │                   └── IMPLEMENTS ──→ EU Directive 2015/849 (AMLD4)
  ├── AFFECTS_PROCESS ──→ Customer Due Diligence
  ├── ISSUED_BY ──→ Finansinspektionen
  └── TARGETS ──→ Exempelbanken AB
```

## Relation sources

Relations are created in three ways:

1. **Manual** — domain experts annotate them during ontology development
2. **Crawler** — extracted automatically during document ingestion
3. **Analysis engine** — inferred by the analysis pipeline based on ontology rules

## Schema

The JSON schema for relations is defined in [`schemas/relation.schema.json`](../schemas/relation.schema.json). Every relation must specify a source, relation type, and target.

See [Relation Types](relation-types.md) for the full catalogue.
