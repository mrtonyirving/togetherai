import type { DecisionType } from './types.js';
import { DECISION_TYPES } from './types.js';
import {
  normalizeAndValidateConceptIdentifier
} from '../concept_identifier.js';
import {
  canonicalizeReferenceAddress,
  formatReferenceBlocksFromAddresses,
  parseCanonicalReference,
  validateReferenceMetadataBlock
} from '../reference_contract.js';

export const SWEDEN_LAW_DEFAULT =
  'Lag (2017:630) om åtgärder mot penningtvätt och finansiering av terrorism';

const SWEDEN_ENFORCEMENT_REFERENCE_PREFIX = 'SE,FI,SB';

export function toConceptId(slug: string): string {
  return normalizeAndValidateConceptIdentifier(slug, {
    fieldName: 'concept_slug',
    example: 'general_risk_assessment'
  });
}

export function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function toProvisionAddress(
  law: string,
  chapter: number,
  paragraph?: number,
  stycke?: number,
  punkt?: number
): string {
  const parts = [`SE,RD,${law}`, `k${chapter}`];
  if (paragraph !== undefined) {
    parts.push(`p${paragraph}`);
  }
  if (stycke !== undefined) {
    parts.push(`s${stycke}`);
  }
  if (punkt !== undefined) {
    parts.push(`pt${punkt}`);
  }
  return parts.join(',');
}

export function parsePositiveIntegerComponent(
  value: string,
  fieldName: string,
  prefix: string,
  options: { optional?: boolean } = {}
): number | undefined {
  const raw = value.trim();
  if (!raw) {
    if (options.optional) {
      return undefined;
    }
    throw new Error(`${fieldName} is required`);
  }

  const lowered = raw.toLowerCase();
  const normalized = lowered.startsWith(prefix)
    ? lowered.slice(prefix.length)
    : lowered;
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${fieldName} must be a positive integer or '${prefix}N'`);
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return parsed;
}

export function parseRequiredPositiveIntegerComponent(
  value: string,
  fieldName: string,
  prefix: string
): number {
  const parsed = parsePositiveIntegerComponent(value, fieldName, prefix);
  if (parsed === undefined) {
    throw new Error(`${fieldName} is required`);
  }
  return parsed;
}

export function parseLawCode(value: string): string {
  const raw = value.trim();
  if (!raw) {
    throw new Error('Law number is required');
  }

  if (/^\d{4}:\d+$/.test(raw)) {
    return raw;
  }

  const match = raw.match(/(\d{4}:\d+)/);
  if (match) {
    return match[1];
  }

  throw new Error(`Invalid law number '${value}'. Expected format like 2017:630`);
}

export function parseLawCodeValidationMessage(value: string): string | undefined {
  try {
    parseLawCode(value);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function normalizeJurisdiction(value: string): 'SE' {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'se' || normalized === 'sweden' || normalized === 'sverige') {
    return 'SE';
  }
  throw new Error(
    `Unsupported jurisdiction '${value}'. Currently only Sweden/SE is supported`
  );
}

export function normalizeDiarienummer(value: string): {
  diarienummer: string;
  referenceTail: string;
} {
  const diarienummer = value.trim();
  if (!diarienummer) {
    throw new Error('diarienummer is required');
  }

  const extracted = diarienummer.match(/(\d{2,4}-\d+)/);
  const referenceTail = extracted ? extracted[1] : diarienummer;
  if (!/^[A-Za-z0-9:_-]+$/.test(referenceTail)) {
    throw new Error(
      `Could not derive reference tail from diarienummer '${diarienummer}'. Use a value like '23-13249'`
    );
  }

  return { diarienummer, referenceTail };
}

export function buildEnforcementReferenceId(
  jurisdiction: 'SE',
  referenceTail: string
): string {
  if (jurisdiction === 'SE') {
    return `${SWEDEN_ENFORCEMENT_REFERENCE_PREFIX},${referenceTail}`;
  }

  throw new Error(
    `Unsupported jurisdiction '${jurisdiction}' for enforcement reference ID`
  );
}

export function dedupeAndSort(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export function parseSwedishAddress(address: string): {
  law: string;
  chapter: number;
  paragraph?: number;
  stycke?: number;
  punkt?: number;
} {
  const parsed = parseCanonicalReference(address, 'Sweden reference');
  if (parsed.jurisdiction !== 'SE') {
    throw new Error(`Invalid Sweden reference '${address}'`);
  }

  return {
    law: parsed.law,
    chapter: parsed.chapter,
    paragraph: parsed.paragraph,
    stycke: parsed.stycke,
    punkt: parsed.punkt
  };
}

export function formatStructuredConceptReferences(addresses: string[]): string[] {
  return formatReferenceBlocksFromAddresses(addresses);
}

export function extractAddressesFromReferenceBody(body: string): string[] {
  const trimmed = body.trim();
  if (!trimmed) {
    return [];
  }

  const lines = body.split(/\r?\n/);
  const blocks: Record<string, string[]> = {};
  let currentBlock: string | null = null;

  const pushLine = (line: string): void => {
    if (!currentBlock) {
      if (line.trim().length > 0) {
        throw new Error(
          "section 'references' must use '### ref_N' metadata blocks"
        );
      }
      return;
    }
    blocks[currentBlock].push(line);
  };

  for (const line of lines) {
    const heading = line.trim().match(/^###\s+(.+)$/);
    if (heading) {
      const name = heading[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      if (!name) {
        throw new Error("section 'references' contains an empty subsection heading");
      }
      if (blocks[name]) {
        throw new Error(`section 'references' has duplicate subsection '${name}'`);
      }
      blocks[name] = [];
      currentBlock = name;
      continue;
    }

    pushLine(line);
  }

  const names = Object.keys(blocks);
  if (names.length === 0) {
    throw new Error("section 'references' must contain at least one '###' subsection");
  }

  const addresses = names.map((name) => {
    const metadata: Record<string, string> = {};
    const blockLines = blocks[name]
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (blockLines.length === 0) {
      throw new Error(`section 'references' subsection '${name}' is empty`);
    }

    for (const line of blockLines) {
      const match = line.match(/^-\s+([^:]+):\s*(.*)$/);
      if (!match) {
        throw new Error(
          `section 'references.${name}' must use '- key: value' bullets (invalid line '${line}')`
        );
      }

      const key = match[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const value = match[2].trim();
      if (!value) {
        throw new Error(`section 'references.${name}' key '${key}' cannot be empty`);
      }
      if (metadata[key] !== undefined) {
        throw new Error(`section 'references.${name}' has duplicate key '${key}'`);
      }
      metadata[key] = value;
    }

    const normalized = validateReferenceMetadataBlock(metadata, `references.${name}`);
    return canonicalizeReferenceAddress(normalized.address, `references.${name}.address`);
  });

  return Array.from(new Set(addresses)).sort((a, b) => a.localeCompare(b));
}

export function parseAndValidateConceptId(value: string): string {
  return normalizeAndValidateConceptIdentifier(value, {
    fieldName: 'concept_id',
    example: 'general_risk_assessment'
  });
}

export function parseAndValidateConceptSlug(value: string): string {
  return normalizeAndValidateConceptIdentifier(value, {
    fieldName: 'concept_slug',
    example: 'general_risk_assessment'
  });
}

export function validateDecisionType(value: string): DecisionType {
  const normalized = value.trim().toLowerCase();
  if (!DECISION_TYPES.includes(normalized as DecisionType)) {
    throw new Error(
      `Invalid decision_type '${value}'. Must be one of: ${DECISION_TYPES.join(', ')}`
    );
  }
  return normalized as DecisionType;
}

export function validateFineFlag(value: string): 'yes' | 'no' {
  const normalized = value.trim().toLowerCase();
  if (normalized !== 'yes' && normalized !== 'no') {
    throw new Error(`Invalid fine value '${value}'. Must be 'yes' or 'no'`);
  }
  return normalized;
}
