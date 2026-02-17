# Sweden Enforcement Actions Ontology

## metadata

- schema_version: 2.0
- document_type: enforcement-action
- jurisdiction: SE
- regulatory_authority: Finansinspektionen

## fields

### diarienummer
- type: string
- required: yes
- allowed_values:
- notes: Authority case reference number

### regulatory_authority
- type: string
- required: yes
- allowed_values:
- notes: Issuing authority

### affected_entity_name
- type: string
- required: yes
- allowed_values:
- notes: Legal name of affected entity

### entity_type
- type: string
- required: yes
- allowed_values:
- notes: Entity classification

### decision_type
- type: enum
- required: yes
- allowed_values: fine,warning,warning_with_fine,revocation,remark,injunction
- notes: Enforcement decision type

### fine
- type: enum
- required: yes
- allowed_values: yes,no
- notes: Whether the decision includes a fine

### fine_amount
- type: number
- required: no
- allowed_values:
- notes: Required when fine=yes

### currency
- type: string
- required: no
- allowed_values:
- notes: ISO 4217 uppercase currency code; required when fine=yes

### affected_regulations
- type: array<object>
- required: yes
- allowed_values:
- notes: List of affected regulations

## affected_regulations_item

### jurisdiction
- type: string
- required: yes
- allowed_values:
- notes: Jurisdiction of the regulation

### entity
- type: string
- required: yes
- allowed_values:
- notes: Legal instrument entity

### name
- type: string
- required: yes
- allowed_values:
- notes: Regulation identifier or title

### affected_parts_of_regulation
- type: array<string>
- required: yes
- allowed_values:
- notes: Specific parts of the regulation

## validation_rules

- fine=no => fine_amount,currency:absent
- fine=yes => fine_amount,currency:required
