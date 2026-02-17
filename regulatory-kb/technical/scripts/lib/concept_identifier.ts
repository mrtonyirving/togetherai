export const CONCEPT_IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

const COMBINING_MARKS_PATTERN = /[\u0300-\u036f]/g;
const NON_ALNUM_PATTERN = /[^a-z0-9]+/g;
const MULTI_UNDERSCORE_PATTERN = /_+/g;
const EDGE_UNDERSCORE_PATTERN = /^_+|_+$/g;

export function normalizeConceptIdentifier(value: string): string {
  return value
    .trim()
    .normalize('NFKD')
    .replace(COMBINING_MARKS_PATTERN, '')
    .toLowerCase()
    .replace(NON_ALNUM_PATTERN, '_')
    .replace(MULTI_UNDERSCORE_PATTERN, '_')
    .replace(EDGE_UNDERSCORE_PATTERN, '');
}

export function isCanonicalConceptIdentifier(value: string): boolean {
  return CONCEPT_IDENTIFIER_PATTERN.test(value);
}

export function normalizeAndValidateConceptIdentifier(
  value: string,
  options: {
    fieldName?: string;
    example?: string;
  } = {}
): string {
  const fieldName = options.fieldName ?? 'concept_id';
  const example = options.example ?? 'general_risk_assessment';
  const raw = value.trim();

  if (!raw) {
    throw new Error(`${fieldName} is required`);
  }

  const normalized = normalizeConceptIdentifier(raw);
  if (!isCanonicalConceptIdentifier(normalized)) {
    throw new Error(
      `Invalid ${fieldName} '${value}'. Expected snake_case, e.g. ${example}`
    );
  }

  return normalized;
}
