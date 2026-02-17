import fg from 'fast-glob';
import fs from 'fs-extra';
import path from 'node:path';

export interface StructuredMarkdownDoc {
  filePath: string;
  relativePath: string;
  metadata: Record<string, unknown>;
  content: string;
}

export interface MarkdownValidationRule {
  when_field: string;
  when_value: string;
  mode: 'required' | 'absent';
  fields: string[];
}

const LEGACY_STRUCTURED_BLOCK_PATTERN =
  /^<!--\s*kb:structured-data\s*-->\s*\r?\n```json\s*\r?\n([\s\S]*?)\r?\n```\s*(?:\r?\n)?/;

const TABLE_SYNTAX_PATTERN = /^\s*\|.*\|\s*\r?\n\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/m;

function normalizeSectionName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function toRelative(filePath: string): string {
  return path.relative(process.cwd(), filePath);
}

export function extractMarkdownSections(markdown: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = markdown.split(/\r?\n/);

  let currentSection: string | null = null;
  let buffer: string[] = [];

  const flush = (): void => {
    if (!currentSection) {
      return;
    }
    sections[currentSection] = buffer.join('\n').trim();
    buffer = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      flush();
      currentSection = normalizeSectionName(headingMatch[1]);
      continue;
    }

    if (currentSection) {
      buffer.push(line);
    }
  }

  flush();
  return sections;
}

function isStrictBulletPath(filePath: string): boolean {
  const rel = toRelative(filePath).split(path.sep).join('/');
  return rel.startsWith('library/ontologies/document-types/enforcement-actions/jurisdictions/se/');
}

export function assertNoMarkdownTables(filePath: string, raw: string): void {
  if (!TABLE_SYNTAX_PATTERN.test(raw)) {
    return;
  }

  throw new Error(
    `${toRelative(filePath)} uses markdown table syntax. This path is bullet-only and requires heading + bullet sections.`
  );
}

export function parseKeyValueBullets(
  sectionBody: string,
  filePath: string,
  sectionName: string
): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = sectionBody.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error(`${toRelative(filePath)} section '${sectionName}' is empty`);
  }

  for (const line of lines) {
    const match = line.match(/^-\s+([^:]+):\s*(.*)$/);
    if (!match) {
      throw new Error(
        `${toRelative(filePath)} section '${sectionName}' must use '- key: value' bullet pairs. Invalid line: '${line}'`
      );
    }

    const key = normalizeSectionName(match[1]);
    const value = match[2].trim();

    if (!key) {
      throw new Error(`${toRelative(filePath)} section '${sectionName}' has an empty key`);
    }

    if (key in out) {
      throw new Error(`${toRelative(filePath)} section '${sectionName}' has duplicate key '${key}'`);
    }

    out[key] = value;
  }

  return out;
}

export function parseSubsectionBlocks(
  sectionBody: string,
  filePath: string,
  sectionName: string
): Record<string, string> {
  const blocks: Record<string, string> = {};
  const lines = sectionBody.split(/\r?\n/);

  let current: string | null = null;
  let buffer: string[] = [];

  const flush = (): void => {
    if (!current) {
      return;
    }

    const content = buffer.join('\n').trim();
    if (!content) {
      throw new Error(`${toRelative(filePath)} section '${sectionName}' subsection '${current}' is empty`);
    }
    blocks[current] = content;
    buffer = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^###\s+(.+?)\s*$/);
    if (headingMatch) {
      flush();
      const name = normalizeSectionName(headingMatch[1]);
      if (!name) {
        throw new Error(`${toRelative(filePath)} section '${sectionName}' has an empty subsection heading`);
      }
      if (name in blocks) {
        throw new Error(`${toRelative(filePath)} section '${sectionName}' has duplicate subsection '${name}'`);
      }
      current = name;
      continue;
    }

    if (current) {
      buffer.push(line);
    }
  }

  flush();

  if (Object.keys(blocks).length === 0) {
    throw new Error(`${toRelative(filePath)} section '${sectionName}' must contain at least one '###' subsection`);
  }

  return blocks;
}

export function parseBulletList(
  sectionBody: string,
  filePath: string,
  sectionName: string
): string[] {
  const out: string[] = [];
  const lines = sectionBody.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);

  if (lines.length === 0) {
    return out;
  }

  for (const line of lines) {
    const match = line.match(/^-\s+(.+)$/);
    if (!match) {
      throw new Error(
        `${toRelative(filePath)} section '${sectionName}' must use '- value' bullets. Invalid line: '${line}'`
      );
    }
    out.push(match[1].trim());
  }

  return out;
}

function parseLegacyStructuredDoc(filePath: string, raw: string): {
  metadata: Record<string, unknown>;
  content: string;
} | null {
  const normalized = raw.replace(/^\uFEFF/, '');
  const match = normalized.match(LEGACY_STRUCTURED_BLOCK_PATTERN);
  if (!match) {
    return null;
  }

  const jsonBlock = match[1].trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBlock);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${toRelative(filePath)} has invalid structured JSON metadata: ${message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${toRelative(filePath)} structured JSON metadata must be a JSON object`);
  }

  return {
    metadata: parsed as Record<string, unknown>,
    content: normalized.slice(match[0].length)
  };
}

function parseRequired(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === 'yes' || normalized === 'true' || normalized === 'required';
}

function splitValues(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function fieldSpecToDefinition(
  spec: Record<string, string>,
  filePath: string,
  sectionName: string,
  fieldName: string
): Record<string, unknown> {
  const rawType = (spec.type ?? '').trim().toLowerCase();
  const required = parseRequired(spec.required ?? '');
  const notes = (spec.notes ?? '').trim();
  const allowedValues = splitValues(spec.allowed_values ?? '');

  if (!rawType) {
    throw new Error(`${toRelative(filePath)} ${sectionName}.${fieldName} is missing 'type'`);
  }

  const field: Record<string, unknown> = { required };
  if (notes) {
    field.description = notes;
  }

  if (rawType === 'string' || rawType === 'number' || rawType === 'date') {
    field.type = rawType;
    return field;
  }

  if (rawType === 'enum') {
    field.type = 'enum';
    field.values = allowedValues;
    return field;
  }

  if (rawType === 'array<string>') {
    field.type = 'array';
    field.items = { type: 'string' };
    return field;
  }

  if (rawType === 'array<object>') {
    field.type = 'array';
    field.items = { type: 'object' };
    return field;
  }

  throw new Error(`${toRelative(filePath)} ${sectionName}.${fieldName} has unsupported type '${rawType}'`);
}

function parseValidationRules(
  sectionBody: string,
  filePath: string
): MarkdownValidationRule[] {
  const rules: MarkdownValidationRule[] = [];
  const lines = parseBulletList(sectionBody, filePath, 'validation_rules');

  for (const line of lines) {
    const match = line.match(/^([a-z_][a-z0-9_]*)=([a-z0-9_]+)\s*=>\s*([a-z0-9_,\s]+):(required|absent)$/i);
    if (!match) {
      throw new Error(
        `${toRelative(filePath)} has invalid validation rule '${line}'. Expected: field=value => a,b:required|absent`
      );
    }

    const fields = match[3]
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    rules.push({
      when_field: match[1],
      when_value: match[2],
      fields,
      mode: match[4].toLowerCase() as 'required' | 'absent'
    });
  }

  return rules;
}

function parseMarkdownOntologyDoc(filePath: string, raw: string): {
  metadata: Record<string, unknown>;
  content: string;
} | null {
  const normalized = raw.replace(/^\uFEFF/, '');

  if (isStrictBulletPath(filePath)) {
    assertNoMarkdownTables(filePath, normalized);
  }

  const sections = extractMarkdownSections(normalized);

  if (!sections.metadata || !sections.fields) {
    return null;
  }

  const metadata = parseKeyValueBullets(sections.metadata, filePath, 'metadata') as Record<string, unknown>;

  const fieldBlocks = parseSubsectionBlocks(sections.fields, filePath, 'fields');
  const fields: Record<string, Record<string, unknown>> = {};

  for (const [fieldName, blockBody] of Object.entries(fieldBlocks)) {
    const spec = parseKeyValueBullets(blockBody, filePath, `fields.${fieldName}`);
    fields[fieldName] = fieldSpecToDefinition(spec, filePath, 'fields', fieldName);
  }

  const affectedRegField = fields.affected_regulations;
  if (affectedRegField?.type === 'array') {
    const items = affectedRegField.items as Record<string, unknown> | undefined;
    if (items?.type === 'object') {
      if (!sections.affected_regulations_item) {
        throw new Error(`${toRelative(filePath)} is missing required section 'affected_regulations_item'`);
      }

      const itemBlocks = parseSubsectionBlocks(
        sections.affected_regulations_item,
        filePath,
        'affected_regulations_item'
      );

      const subFields: Array<Record<string, unknown>> = [];
      for (const [itemFieldName, blockBody] of Object.entries(itemBlocks)) {
        const spec = parseKeyValueBullets(
          blockBody,
          filePath,
          `affected_regulations_item.${itemFieldName}`
        );

        subFields.push({
          name: itemFieldName,
          ...fieldSpecToDefinition(spec, filePath, 'affected_regulations_item', itemFieldName)
        });
      }

      items.sub_fields = subFields;
    }
  }

  metadata.fields = fields;
  metadata.validation_rules = sections.validation_rules
    ? parseValidationRules(sections.validation_rules, filePath)
    : [];

  return {
    metadata,
    content: normalized
  };
}

export async function readStructuredMarkdownDoc(
  filePath: string
): Promise<StructuredMarkdownDoc | null> {
  const raw = await fs.readFile(filePath, 'utf8');

  if (isStrictBulletPath(filePath)) {
    const parsed = parseMarkdownOntologyDoc(filePath, raw);
    if (!parsed) {
      throw new Error(
        `${toRelative(filePath)} is missing required bullet sections. Expected at least '## metadata' and '## fields'.`
      );
    }

    return {
      filePath,
      relativePath: path.relative(process.cwd(), filePath).split(path.sep).join('/'),
      metadata: parsed.metadata,
      content: parsed.content
    };
  }

  const legacy = parseLegacyStructuredDoc(filePath, raw);
  const parsed = legacy ?? parseMarkdownOntologyDoc(filePath, raw);

  if (!parsed) {
    return null;
  }

  return {
    filePath,
    relativePath: path.relative(process.cwd(), filePath).split(path.sep).join('/'),
    metadata: parsed.metadata,
    content: parsed.content
  };
}

export async function globMarkdown(patterns: string | string[]): Promise<string[]> {
  const files = await fg(patterns, {
    cwd: process.cwd(),
    absolute: true,
    onlyFiles: true,
    dot: false
  });

  return files.sort((a, b) => a.localeCompare(b));
}

function normalizeFieldList(fieldList: unknown): Record<string, Record<string, unknown>> {
  if (!Array.isArray(fieldList)) {
    return {};
  }

  const out: Record<string, Record<string, unknown>> = {};
  for (const entry of fieldList) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const field = entry as Record<string, unknown>;
    const name = field.name;
    if (typeof name !== 'string' || name.length === 0) {
      continue;
    }

    const normalized: Record<string, unknown> = { ...field };
    delete normalized.name;
    out[name] = normalized;
  }

  return out;
}

export function fieldsToMap(fields: unknown): Record<string, Record<string, unknown>> {
  if (!fields) {
    return {};
  }

  if (Array.isArray(fields)) {
    return normalizeFieldList(fields);
  }

  if (typeof fields === 'object') {
    return fields as Record<string, Record<string, unknown>>;
  }

  return {};
}

export function fieldListToProperties(
  subFields: unknown
): Record<string, Record<string, unknown>> {
  return normalizeFieldList(subFields);
}

export function getEnumValues(fieldDef: unknown): string[] {
  if (!fieldDef || typeof fieldDef !== 'object') {
    return [];
  }

  const values = (fieldDef as Record<string, unknown>).values;
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter((v): v is string => typeof v === 'string');
}
