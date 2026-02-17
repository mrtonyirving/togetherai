import fs from 'fs-extra';

import { repoPath, toPosixRelative } from './io.js';

export type JurisdictionCode = 'SE' | 'EU';

export interface JurisdictionReferenceTemplate {
  schema_version: string;
  document_type: string;
  jurisdiction: JurisdictionCode;
  entity: 'RD';
  metadata_key_order: string[];
  reference_schema: Record<string, unknown>;
}

const TEMPLATE_PATHS: Record<JurisdictionCode, string> = {
  SE: repoPath(
    'library',
    'ontologies',
    'document-types',
    'legislation',
    'jurisdictions',
    'Sweden',
    'law.json'
  ),
  EU: repoPath(
    'library',
    'ontologies',
    'document-types',
    'legislation',
    'jurisdictions',
    'EU',
    'law.json'
  )
};

const cache = new Map<JurisdictionCode, JurisdictionReferenceTemplate>();

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseTemplate(
  jurisdiction: JurisdictionCode,
  filePath: string,
  raw: string
): JurisdictionReferenceTemplate {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${toPosixRelative(filePath)} is not valid JSON: ${message}`
    );
  }

  const record = asRecord(parsed);
  if (!record) {
    throw new Error(`${toPosixRelative(filePath)} must contain a JSON object`);
  }

  const schemaVersion = String(record.schema_version ?? '').trim();
  const documentType = String(record.document_type ?? '').trim();
  const templateJurisdiction = String(record.jurisdiction ?? '').trim().toUpperCase();
  const entity = String(record.entity ?? '').trim().toUpperCase();
  const metadataKeyOrder = Array.isArray(record.metadata_key_order)
    ? record.metadata_key_order
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : [];
  const referenceSchema = asRecord(record.reference_schema);

  if (!schemaVersion) {
    throw new Error(`${toPosixRelative(filePath)} must define 'schema_version'`);
  }
  if (!documentType) {
    throw new Error(`${toPosixRelative(filePath)} must define 'document_type'`);
  }
  if (templateJurisdiction !== jurisdiction) {
    throw new Error(
      `${toPosixRelative(filePath)} has jurisdiction '${templateJurisdiction}', expected '${jurisdiction}'`
    );
  }
  if (entity !== 'RD') {
    throw new Error(`${toPosixRelative(filePath)} must define entity 'RD'`);
  }
  if (metadataKeyOrder.length === 0) {
    throw new Error(`${toPosixRelative(filePath)} must define 'metadata_key_order'`);
  }
  if (!referenceSchema) {
    throw new Error(`${toPosixRelative(filePath)} must define 'reference_schema'`);
  }

  return {
    schema_version: schemaVersion,
    document_type: documentType,
    jurisdiction,
    entity: 'RD',
    metadata_key_order: metadataKeyOrder,
    reference_schema: referenceSchema
  };
}

export function referenceTemplatePath(jurisdiction: JurisdictionCode): string {
  return TEMPLATE_PATHS[jurisdiction];
}

export function loadJurisdictionReferenceTemplateSync(
  jurisdiction: JurisdictionCode
): JurisdictionReferenceTemplate {
  const cached = cache.get(jurisdiction);
  if (cached) {
    return cached;
  }

  const filePath = TEMPLATE_PATHS[jurisdiction];
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = parseTemplate(jurisdiction, filePath, raw);
  cache.set(jurisdiction, parsed);
  return parsed;
}

export function loadAllJurisdictionReferenceTemplatesSync(): Record<
  JurisdictionCode,
  JurisdictionReferenceTemplate
> {
  return {
    SE: loadJurisdictionReferenceTemplateSync('SE'),
    EU: loadJurisdictionReferenceTemplateSync('EU')
  };
}

export function clearJurisdictionReferenceTemplateCache(): void {
  cache.clear();
}
