import fg from 'fast-glob';
import fs from 'fs-extra';
import path from 'node:path';

import { fieldToJsonSchema } from './lib/schema.js';
import { fieldsToMap, readStructuredMarkdownDoc } from './lib/structured_markdown.js';
import { getRunOptions, repoPath, toPosixRelative, writeJsonFile } from './lib/io.js';
import {
  loadJurisdictionReferenceTemplateSync,
  referenceTemplatePath,
  type JurisdictionCode
} from './lib/reference_templates.js';

const LIBRARY_DIR = repoPath('library');
const ARTIFACTS_DIR = repoPath('technical', 'artifacts');
const ONTOLOGY_FILE = repoPath(
  'library',
  'ontologies',
  'document-types',
  'enforcement-actions',
  'jurisdictions',
  'se',
  'enforcement-actions.md'
);
const ENFORCEMENT_SCHEMA_DIR = repoPath(
  'technical',
  'artifacts',
  'schemas',
  'enforcement-actions'
);
const ENFORCEMENT_SCHEMA_FILE = repoPath(
  'technical',
  'artifacts',
  'schemas',
  'enforcement-actions',
  'se.schema.json'
);
const LEGISLATION_SCHEMA_DIR = repoPath(
  'technical',
  'artifacts',
  'schemas',
  'legislation'
);
const LEGISLATION_SCHEMA_TARGETS: Array<{
  jurisdiction: JurisdictionCode;
  fileName: string;
}> = [
  { jurisdiction: 'SE', fileName: 'se-reference.schema.json' },
  { jurisdiction: 'EU', fileName: 'eu-reference.schema.json' }
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function logSchemaUpdate(check: boolean, filePath: string): void {
  const status = check ? 'Would update' : 'Updated';
  console.log(`${status} ${toPosixRelative(filePath)}`);
}

async function pruneJsonDir(
  directory: string,
  keepFiles: Set<string>,
  check: boolean
): Promise<number> {
  if (!(await fs.pathExists(directory))) {
    return 0;
  }

  const files = await fg('**/*.json', {
    cwd: directory,
    onlyFiles: true,
    dot: false
  });

  let changes = 0;
  for (const rel of files) {
    if (keepFiles.has(rel)) {
      continue;
    }

    const abs = path.join(directory, rel);
    changes += 1;

    if (check) {
      console.log(`Would remove ${toPosixRelative(abs)}`);
      continue;
    }

    await fs.remove(abs);
    console.log(`Removed ${toPosixRelative(abs)}`);
  }

  return changes;
}

function buildConditionalRules(validationRules: unknown): Record<string, unknown>[] {
  if (!Array.isArray(validationRules)) {
    return [];
  }

  const allOf: Record<string, unknown>[] = [];
  for (const rawRule of validationRules) {
    const rule = asRecord(rawRule);
    if (!rule) {
      continue;
    }

    const whenField = typeof rule.when_field === 'string' ? rule.when_field : '';
    const whenValue = typeof rule.when_value === 'string' ? rule.when_value : '';
    const mode = typeof rule.mode === 'string' ? rule.mode : '';
    const fields = Array.isArray(rule.fields)
      ? rule.fields.filter((entry): entry is string => typeof entry === 'string')
      : [];

    if (!whenField || !whenValue || !mode || fields.length === 0) {
      continue;
    }

    const baseIf = {
      properties: {
        [whenField]: { const: whenValue }
      },
      required: [whenField]
    };

    if (mode === 'required') {
      allOf.push({
        if: baseIf,
        then: { required: fields }
      });
      continue;
    }

    if (mode === 'absent') {
      allOf.push({
        if: baseIf,
        then: {
          not: {
            anyOf: fields.map((field) => ({ required: [field] }))
          }
        }
      });
    }
  }

  return allOf;
}

async function buildSchema(check: boolean): Promise<number> {
  const doc = await readStructuredMarkdownDoc(ONTOLOGY_FILE);
  if (!doc) {
    throw new Error(`Could not parse ontology file: ${toPosixRelative(ONTOLOGY_FILE)}`);
  }

  const fm = doc.metadata;
  const fieldDefs = fieldsToMap(fm.fields);

  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [fieldName, fieldDef] of Object.entries(fieldDefs)) {
    properties[fieldName] = fieldToJsonSchema(fieldDef);
    if (fieldDef.required === true) {
      required.push(fieldName);
    }
  }

  const currency = asRecord(properties.currency);
  if (currency) {
    currency.pattern = '^[A-Z]{3}$';
  }

  const schema: Record<string, unknown> = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'enforcement-actions - SE',
    type: 'object',
    additionalProperties: false,
    metadata: {
      schema_version: String(fm.schema_version ?? '2.0'),
      document_type: String(fm.document_type ?? 'enforcement-action'),
      jurisdiction: String(fm.jurisdiction ?? 'SE'),
      regulatory_authority: String(fm.regulatory_authority ?? '')
    },
    properties,
    required
  };

  const allOf = buildConditionalRules(fm.validation_rules);
  if (allOf.length > 0) {
    schema.allOf = allOf;
  }

  const result = await writeJsonFile(ENFORCEMENT_SCHEMA_FILE, schema, { check });
  if (result.changed) {
    logSchemaUpdate(check, ENFORCEMENT_SCHEMA_FILE);
  }

  return result.changed ? 1 : 0;
}

async function buildLegislationSchemas(check: boolean): Promise<number> {
  let changes = 0;

  for (const target of LEGISLATION_SCHEMA_TARGETS) {
    const template = loadJurisdictionReferenceTemplateSync(target.jurisdiction);
    const sourcePath = referenceTemplatePath(target.jurisdiction);
    const schema = template.reference_schema;
    const outPath = repoPath(
      'technical',
      'artifacts',
      'schemas',
      'legislation',
      target.fileName
    );

    const result = await writeJsonFile(outPath, schema, { check });
    if (result.changed) {
      logSchemaUpdate(check, outPath);
      console.log(`  source: ${toPosixRelative(sourcePath)}`);
      changes += 1;
    }
  }

  return changes;
}

async function main(): Promise<void> {
  const options = getRunOptions(process.argv.slice(2));

  if (!(await fs.pathExists(LIBRARY_DIR))) {
    throw new Error('library directory not found');
  }

  if (!options.check) {
    await fs.ensureDir(ARTIFACTS_DIR);
    await fs.ensureDir(ENFORCEMENT_SCHEMA_DIR);
    await fs.ensureDir(LEGISLATION_SCHEMA_DIR);
  }

  const keepEnforcement = new Set<string>(['se.schema.json']);
  const keepLegislation = new Set<string>(
    LEGISLATION_SCHEMA_TARGETS.map((target) => target.fileName)
  );

  let changes = 0;
  changes += await pruneJsonDir(ENFORCEMENT_SCHEMA_DIR, keepEnforcement, options.check);
  changes += await pruneJsonDir(LEGISLATION_SCHEMA_DIR, keepLegislation, options.check);
  changes += await buildSchema(options.check);
  changes += await buildLegislationSchemas(options.check);

  if (options.check) {
    if (changes > 0) {
      console.error(`\n${changes} artifact file(s) would be updated by sync_schemas.ts`);
      process.exit(1);
    }
    console.log('sync_schemas.ts check passed.');
    return;
  }

  console.log(`\nDone. ${changes} artifact file(s) updated by sync_schemas.ts.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
