import fs from 'fs-extra';

import {
  assertNoMarkdownTables,
  extractMarkdownSections,
  fieldsToMap,
  globMarkdown,
  parseKeyValueBullets,
  parseSubsectionBlocks,
  readStructuredMarkdownDoc
} from './lib/structured_markdown.js';
import { repoPath, toPosixRelative } from './lib/io.js';

const ONTOLOGY_FILE = repoPath(
  'library',
  'ontologies',
  'document-types',
  'enforcement-actions',
  'jurisdictions',
  'se',
  'enforcement-actions.md'
);

const REQUIRED_FIELDS = [
  'diarienummer',
  'regulatory_authority',
  'affected_entity_name',
  'entity_type',
  'decision_type',
  'fine',
  'fine_amount',
  'currency',
  'affected_regulations'
] as const;

const DECISION_TYPES = new Set([
  'fine',
  'warning',
  'warning_with_fine',
  'revocation',
  'remark',
  'injunction'
]);

const FINE_VALUES = new Set(['yes', 'no']);

class ValidationContext {
  errors: string[] = [];

  addError(filePath: string, message: string): void {
    this.errors.push(`ERROR [${toPosixRelative(filePath)}]: ${message}`);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asFieldDefMap(metadata: Record<string, unknown>): Record<string, Record<string, unknown>> {
  return fieldsToMap(metadata.fields);
}

function requiredField(
  ctx: ValidationContext,
  filePath: string,
  fields: Record<string, Record<string, unknown>>,
  name: string
): Record<string, unknown> | null {
  const field = fields[name];
  if (!field) {
    ctx.addError(filePath, `Missing required field '${name}' in fields section`);
    return null;
  }
  return field;
}

function expectFieldType(
  ctx: ValidationContext,
  filePath: string,
  field: Record<string, unknown>,
  fieldName: string,
  expectedType: string
): void {
  if (field.type !== expectedType) {
    ctx.addError(filePath, `Field '${fieldName}' must have type '${expectedType}'`);
  }
}

function expectRequired(
  ctx: ValidationContext,
  filePath: string,
  field: Record<string, unknown>,
  fieldName: string,
  expected: boolean
): void {
  if (field.required !== expected) {
    ctx.addError(filePath, `Field '${fieldName}' required flag must be '${String(expected)}'`);
  }
}

function normalizeEnumValues(field: Record<string, unknown>): string[] {
  const values = field.values;
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function validateOntologyMetadata(ctx: ValidationContext, filePath: string, metadata: Record<string, unknown>): void {
  if (metadata.document_type !== 'enforcement-action') {
    ctx.addError(filePath, "document_type must be 'enforcement-action'");
  }

  if (metadata.jurisdiction !== 'SE') {
    ctx.addError(filePath, "jurisdiction must be 'SE'");
  }

  if (typeof metadata.schema_version !== 'string' || metadata.schema_version.length === 0) {
    ctx.addError(filePath, 'schema_version must be a non-empty string');
  }

  if (typeof metadata.regulatory_authority !== 'string' || metadata.regulatory_authority.length === 0) {
    ctx.addError(filePath, 'regulatory_authority must be a non-empty string');
  }
}

function validateFieldModel(ctx: ValidationContext, filePath: string, metadata: Record<string, unknown>): void {
  const fields = asFieldDefMap(metadata);

  const fieldNames = Object.keys(fields).sort((a, b) => a.localeCompare(b));
  const expectedFieldNames = [...REQUIRED_FIELDS].sort((a, b) => a.localeCompare(b));

  if (fieldNames.length !== expectedFieldNames.length) {
    ctx.addError(
      filePath,
      `Fields must be exactly: ${expectedFieldNames.join(', ')}. Found: ${fieldNames.join(', ')}`
    );
  }

  for (const name of expectedFieldNames) {
    if (!fields[name]) {
      ctx.addError(filePath, `Missing field '${name}'`);
    }
  }

  const diarienummer = requiredField(ctx, filePath, fields, 'diarienummer');
  if (diarienummer) {
    expectFieldType(ctx, filePath, diarienummer, 'diarienummer', 'string');
    expectRequired(ctx, filePath, diarienummer, 'diarienummer', true);
  }

  const authority = requiredField(ctx, filePath, fields, 'regulatory_authority');
  if (authority) {
    expectFieldType(ctx, filePath, authority, 'regulatory_authority', 'string');
    expectRequired(ctx, filePath, authority, 'regulatory_authority', true);
  }

  const entity = requiredField(ctx, filePath, fields, 'affected_entity_name');
  if (entity) {
    expectFieldType(ctx, filePath, entity, 'affected_entity_name', 'string');
    expectRequired(ctx, filePath, entity, 'affected_entity_name', true);
  }

  const entityType = requiredField(ctx, filePath, fields, 'entity_type');
  if (entityType) {
    expectFieldType(ctx, filePath, entityType, 'entity_type', 'string');
    expectRequired(ctx, filePath, entityType, 'entity_type', true);
  }

  const decisionType = requiredField(ctx, filePath, fields, 'decision_type');
  if (decisionType) {
    expectFieldType(ctx, filePath, decisionType, 'decision_type', 'enum');
    expectRequired(ctx, filePath, decisionType, 'decision_type', true);

    const decisionValues = normalizeEnumValues(decisionType);
    const unknown = decisionValues.filter((value) => !DECISION_TYPES.has(value));
    if (unknown.length > 0) {
      ctx.addError(filePath, `decision_type has unsupported enum values: ${unknown.join(', ')}`);
    }

    for (const value of DECISION_TYPES) {
      if (!decisionValues.includes(value)) {
        ctx.addError(filePath, `decision_type is missing enum value '${value}'`);
      }
    }
  }

  const fine = requiredField(ctx, filePath, fields, 'fine');
  if (fine) {
    expectFieldType(ctx, filePath, fine, 'fine', 'enum');
    expectRequired(ctx, filePath, fine, 'fine', true);

    const fineValues = normalizeEnumValues(fine);
    const unknown = fineValues.filter((value) => !FINE_VALUES.has(value));
    if (unknown.length > 0) {
      ctx.addError(filePath, `fine has unsupported enum values: ${unknown.join(', ')}`);
    }

    for (const value of FINE_VALUES) {
      if (!fineValues.includes(value)) {
        ctx.addError(filePath, `fine is missing enum value '${value}'`);
      }
    }
  }

  const fineAmount = requiredField(ctx, filePath, fields, 'fine_amount');
  if (fineAmount) {
    expectFieldType(ctx, filePath, fineAmount, 'fine_amount', 'number');
    expectRequired(ctx, filePath, fineAmount, 'fine_amount', false);
  }

  const currency = requiredField(ctx, filePath, fields, 'currency');
  if (currency) {
    expectFieldType(ctx, filePath, currency, 'currency', 'string');
    expectRequired(ctx, filePath, currency, 'currency', false);
  }

  const affectedRegs = requiredField(ctx, filePath, fields, 'affected_regulations');
  if (affectedRegs) {
    expectFieldType(ctx, filePath, affectedRegs, 'affected_regulations', 'array');
    expectRequired(ctx, filePath, affectedRegs, 'affected_regulations', true);

    const items = asRecord(affectedRegs.items);
    if (!items || items.type !== 'object') {
      ctx.addError(filePath, "affected_regulations must be typed as 'array<object>'");
      return;
    }

    const subFieldsRaw = items.sub_fields;
    if (!Array.isArray(subFieldsRaw)) {
      ctx.addError(filePath, 'affected_regulations_item section is required and must define sub-fields');
      return;
    }

    const subFieldMap: Record<string, Record<string, unknown>> = {};
    for (const raw of subFieldsRaw) {
      const sub = asRecord(raw);
      if (!sub || typeof sub.name !== 'string') {
        continue;
      }
      const name = sub.name;
      const normalized: Record<string, unknown> = { ...sub };
      delete normalized.name;
      subFieldMap[name] = normalized;
    }

    const expectedSubFields = ['jurisdiction', 'entity', 'name', 'affected_parts_of_regulation'];
    for (const fieldName of expectedSubFields) {
      if (!subFieldMap[fieldName]) {
        ctx.addError(filePath, `affected_regulations_item is missing '${fieldName}'`);
      }
    }

    const regJurisdiction = subFieldMap.jurisdiction;
    if (regJurisdiction) {
      expectFieldType(ctx, filePath, regJurisdiction, 'affected_regulations_item.jurisdiction', 'string');
      expectRequired(ctx, filePath, regJurisdiction, 'affected_regulations_item.jurisdiction', true);
    }

    const regEntity = subFieldMap.entity;
    if (regEntity) {
      expectFieldType(ctx, filePath, regEntity, 'affected_regulations_item.entity', 'string');
      expectRequired(ctx, filePath, regEntity, 'affected_regulations_item.entity', true);
    }

    const regName = subFieldMap.name;
    if (regName) {
      expectFieldType(ctx, filePath, regName, 'affected_regulations_item.name', 'string');
      expectRequired(ctx, filePath, regName, 'affected_regulations_item.name', true);
    }

    const affectedParts = subFieldMap.affected_parts_of_regulation;
    if (affectedParts) {
      expectFieldType(
        ctx,
        filePath,
        affectedParts,
        'affected_regulations_item.affected_parts_of_regulation',
        'array'
      );
      expectRequired(
        ctx,
        filePath,
        affectedParts,
        'affected_regulations_item.affected_parts_of_regulation',
        true
      );

      const partItems = asRecord(affectedParts.items);
      if (!partItems || partItems.type !== 'string') {
        ctx.addError(filePath, 'affected_parts_of_regulation must be array<string>');
      }
    }
  }
}

function validateRules(ctx: ValidationContext, filePath: string, metadata: Record<string, unknown>): void {
  const rulesRaw = metadata.validation_rules;
  if (!Array.isArray(rulesRaw)) {
    ctx.addError(filePath, 'validation_rules must be defined');
    return;
  }

  const normalized = rulesRaw
    .map((rule) => asRecord(rule))
    .filter((rule): rule is Record<string, unknown> => Boolean(rule))
    .map((rule) => {
      const whenField = String(rule.when_field ?? '');
      const whenValue = String(rule.when_value ?? '');
      const mode = String(rule.mode ?? '');
      const fields = Array.isArray(rule.fields)
        ? rule.fields.filter((entry): entry is string => typeof entry === 'string').sort((a, b) => a.localeCompare(b))
        : [];
      return `${whenField}=${whenValue}:${mode}:${fields.join(',')}`;
    });

  const requiredRules = new Set([
    'fine=no:absent:currency,fine_amount',
    'fine=yes:required:currency,fine_amount'
  ]);

  for (const requiredRule of requiredRules) {
    if (!normalized.includes(requiredRule)) {
      ctx.addError(filePath, `Missing validation rule '${requiredRule}'`);
    }
  }
}

function parseRegulationBlock(filePath: string, blockName: string, body: string): {
  jurisdiction: string;
  entity: string;
  name: string;
  affected_parts_of_regulation: string[];
} {
  const lines = body.split(/\r?\n/);
  const scalars: Record<string, string> = {};
  let parts: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const line = rawLine.trimEnd();

    if (line.trim().length === 0) {
      continue;
    }

    const topLevel = line.match(/^\s*-\s+([^:]+):\s*(.*)$/);
    if (!topLevel) {
      throw new Error(
        `${toPosixRelative(filePath)} affected_regulations.${blockName} must use '- key: value' lines. Invalid line '${line.trim()}'`
      );
    }

    const key = topLevel[1].trim();
    const value = topLevel[2].trim();

    if (key === 'affected_parts_of_regulation') {
      if (value.length > 0) {
        throw new Error(
          `${toPosixRelative(filePath)} affected_regulations.${blockName} requires 'affected_parts_of_regulation:' followed by nested bullets`
        );
      }

      const collected: string[] = [];
      while (i + 1 < lines.length) {
        const next = lines[i + 1].trimEnd();
        const nextMatch = next.match(/^\s{2,}-\s+(.+)$/);
        if (!nextMatch) {
          break;
        }
        collected.push(nextMatch[1].trim());
        i += 1;
      }

      if (collected.length === 0) {
        throw new Error(
          `${toPosixRelative(filePath)} affected_regulations.${blockName}.affected_parts_of_regulation must contain nested bullets`
        );
      }

      parts = collected;
      continue;
    }

    scalars[key] = value;
  }

  return {
    jurisdiction: scalars.jurisdiction ?? '',
    entity: scalars.entity ?? '',
    name: scalars.name ?? '',
    affected_parts_of_regulation: parts
  };
}

function validateExampleFile(ctx: ValidationContext, filePath: string): void {
  const raw = fs.readFileSync(filePath, 'utf8');
  assertNoMarkdownTables(filePath, raw);

  const sections = extractMarkdownSections(raw);

  if (!sections.record) {
    ctx.addError(filePath, "Missing required section 'record'");
    return;
  }

  if (!sections.affected_regulations) {
    ctx.addError(filePath, "Missing required section 'affected_regulations'");
    return;
  }

  let record: Record<string, string>;
  try {
    record = parseKeyValueBullets(sections.record, filePath, 'record');
  } catch (error) {
    ctx.addError(filePath, error instanceof Error ? error.message : String(error));
    return;
  }

  const requiredScalar = [
    'diarienummer',
    'regulatory_authority',
    'affected_entity_name',
    'entity_type',
    'decision_type',
    'fine'
  ];

  for (const name of requiredScalar) {
    if (!(name in record) || record[name].length === 0) {
      ctx.addError(filePath, `Record is missing required field '${name}'`);
    }
  }

  if (record.decision_type && !DECISION_TYPES.has(record.decision_type)) {
    ctx.addError(filePath, `Invalid decision_type '${record.decision_type}'`);
  }

  if (record.fine && !FINE_VALUES.has(record.fine)) {
    ctx.addError(filePath, `Invalid fine value '${record.fine}'`);
  }

  if (record.fine === 'yes') {
    if (!record.fine_amount || Number.isNaN(Number(record.fine_amount))) {
      ctx.addError(filePath, 'fine=yes requires numeric fine_amount');
    }

    if (!record.currency || !/^[A-Z]{3}$/.test(record.currency)) {
      ctx.addError(filePath, 'fine=yes requires currency in ISO 4217 uppercase format');
    }
  }

  if (record.fine === 'no') {
    if (record.fine_amount && record.fine_amount.length > 0) {
      ctx.addError(filePath, 'fine=no requires fine_amount to be absent or empty');
    }

    if (record.currency && record.currency.length > 0) {
      ctx.addError(filePath, 'fine=no requires currency to be absent or empty');
    }
  }

  let regulationBlocks: Record<string, string>;
  try {
    regulationBlocks = parseSubsectionBlocks(
      sections.affected_regulations,
      filePath,
      'affected_regulations'
    );
  } catch (error) {
    ctx.addError(filePath, error instanceof Error ? error.message : String(error));
    return;
  }

  for (const [name, body] of Object.entries(regulationBlocks)) {
    let regulation: {
      jurisdiction: string;
      entity: string;
      name: string;
      affected_parts_of_regulation: string[];
    };

    try {
      regulation = parseRegulationBlock(filePath, name, body);
    } catch (error) {
      ctx.addError(filePath, error instanceof Error ? error.message : String(error));
      continue;
    }

    if (!regulation.jurisdiction) {
      ctx.addError(filePath, `affected_regulations.${name} is missing 'jurisdiction'`);
    }

    if (!regulation.entity) {
      ctx.addError(filePath, `affected_regulations.${name} is missing 'entity'`);
    }

    if (!regulation.name) {
      ctx.addError(filePath, `affected_regulations.${name} is missing 'name'`);
    }

    if (regulation.affected_parts_of_regulation.length === 0) {
      ctx.addError(filePath, `affected_regulations.${name} must include affected_parts_of_regulation items`);
    }
  }
}

async function main(): Promise<void> {
  if (!(await fs.pathExists(repoPath('library')))) {
    throw new Error('library directory not found');
  }

  console.log('Validating ontology files...');

  const ctx = new ValidationContext();
  const ontologyDoc = await readStructuredMarkdownDoc(ONTOLOGY_FILE);
  if (!ontologyDoc) {
    ctx.addError(ONTOLOGY_FILE, 'Failed to parse ontology bullet sections');
  } else {
    validateOntologyMetadata(ctx, ONTOLOGY_FILE, ontologyDoc.metadata);
    validateFieldModel(ctx, ONTOLOGY_FILE, ontologyDoc.metadata);
    validateRules(ctx, ONTOLOGY_FILE, ontologyDoc.metadata);
  }

  const exampleFiles = await globMarkdown([
    'library/ontologies/document-types/enforcement-actions/jurisdictions/se/examples/**/*.md'
  ]);

  if (exampleFiles.length === 0) {
    ctx.addError(ONTOLOGY_FILE, 'At least one Sweden enforcement example file is required');
  }

  for (const file of exampleFiles) {
    validateExampleFile(ctx, file);
  }

  for (const error of ctx.errors) {
    console.log(`  ${error}`);
  }

  console.log(`\n${ctx.errors.length} error(s), 0 warning(s)`);

  if (ctx.errors.length > 0) {
    process.exit(1);
  }

  console.log('Validation passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
