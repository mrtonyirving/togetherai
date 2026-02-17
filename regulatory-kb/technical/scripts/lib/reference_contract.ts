import {
  loadJurisdictionReferenceTemplateSync,
  type JurisdictionCode
} from './reference_templates.js';

export interface ParsedSwedishReference {
  jurisdiction: 'SE';
  entity: 'RD';
  canonical: string;
  law: string;
  chapter: number;
  paragraph?: number;
  stycke?: number;
  punkt?: number;
  level: number;
  levelLabel: 'Kapitel' | 'Paragraf' | 'Stycke' | 'Punkt';
}

export interface ParsedEuReference {
  jurisdiction: 'EU';
  entity: 'RD';
  canonical: string;
  citation: string;
  recitalStart?: number;
  recitalEnd?: number;
  chapter?: number;
  section?: number;
  article?: number;
  articleHeadingSlug?: string;
  paragraph?: number;
  subparagraph?: number;
  point?: string;
  indent?: string;
  level: number;
  levelLabel:
    | 'Citation'
    | 'Recitals'
    | 'Chapter'
    | 'Section'
    | 'Article'
    | 'Paragraph'
    | 'Subparagraph'
    | 'Point'
    | 'Indent';
}

export type ParsedReference = ParsedSwedishReference | ParsedEuReference;

export interface ReferenceHierarchyNode {
  level: number;
  name: string;
}

const SWEDISH_REFERENCE_PATTERN =
  /^SE,RD,(\d{4}:\d+),k(\d+)(?:,p(\d+)(?:,s(\d+)(?:,pt(\d+))?)?)?$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function fail(context: string, message: string): never {
  throw new Error(`${context}: ${message}`);
}

function parsePositiveInteger(
  rawValue: string,
  context: string,
  fieldName: string
): number {
  if (!/^\d+$/.test(rawValue)) {
    fail(context, `${fieldName} must be a positive integer`);
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    fail(context, `${fieldName} must be a positive integer`);
  }

  return parsed;
}

function parseOptionalPositiveInteger(
  rawValue: string | undefined,
  context: string,
  fieldName: string
): number | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    fail(context, `${fieldName} cannot be empty`);
  }

  return parsePositiveInteger(trimmed, context, fieldName);
}

function parseEuRecitalRange(
  rawValue: string,
  context: string,
  fieldName: string
): { start: number; end: number } {
  const normalized = rawValue.trim().toLowerCase();
  const match = normalized.match(/^(\d+)(?:-(\d+))?$/);
  if (!match) {
    fail(context, `${fieldName} must be in form 'N' or 'N-M'`);
  }

  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : start;
  if (start < 1 || end < 1 || start > 175 || end > 175 || end < start) {
    fail(context, `${fieldName} must be within 1-175 and have start <= end`);
  }

  return { start, end };
}

function normalizeArticleHeadingSlug(value: string, context: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) {
    fail(context, 'article_heading must contain alphanumeric characters');
  }
  return slug;
}

function normalizeEuToken(value: string, context: string, fieldName: string): string {
  let normalized = value.trim().toLowerCase();
  if (normalized.startsWith('pt') && fieldName === 'point') {
    normalized = normalized.slice(2);
  }
  if (normalized.startsWith('ind') && fieldName === 'indent') {
    normalized = normalized.slice(3);
  }

  normalized = normalized
    .replace(/^\(+/, '')
    .replace(/\)+$/, '')
    .replace(/[.)]+$/, '')
    .trim();

  if (!/^[a-z0-9]+$/.test(normalized)) {
    fail(context, `${fieldName} must be an alphanumeric token`);
  }

  return normalized;
}

function toSwedishCanonical(
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

function euLevelLabelFromParts(parts: {
  recitalStart?: number;
  chapter?: number;
  section?: number;
  article?: number;
  articleHeadingSlug?: string;
  paragraph?: number;
  subparagraph?: number;
  point?: string;
  indent?: string;
}): {
  level: number;
  label: ParsedEuReference['levelLabel'];
} {
  if (parts.recitalStart !== undefined) {
    return { level: 1, label: 'Recitals' };
  }
  if (parts.indent !== undefined) {
    return { level: 7, label: 'Indent' };
  }
  if (parts.point !== undefined) {
    return { level: 6, label: 'Point' };
  }
  if (parts.subparagraph !== undefined) {
    return { level: 5, label: 'Subparagraph' };
  }
  if (parts.paragraph !== undefined) {
    return { level: 4, label: 'Paragraph' };
  }
  if (parts.article !== undefined || parts.articleHeadingSlug !== undefined) {
    return { level: 3, label: 'Article' };
  }
  if (parts.section !== undefined) {
    return { level: 2, label: 'Section' };
  }
  if (parts.chapter !== undefined) {
    return { level: 1, label: 'Chapter' };
  }
  return { level: 1, label: 'Citation' };
}

function parseSwedishCanonical(address: string, context: string): ParsedSwedishReference {
  const normalized = address.trim();
  const match = normalized.match(SWEDISH_REFERENCE_PATTERN);
  if (!match) {
    fail(
      context,
      `invalid Sweden reference '${address}'. Expected format SE,RD,2017:630,kX[,pY[,sZ[,ptW]]]`
    );
  }

  const paragraph = match[3] ? Number.parseInt(match[3], 10) : undefined;
  const stycke = match[4] ? Number.parseInt(match[4], 10) : undefined;
  const punkt = match[5] ? Number.parseInt(match[5], 10) : undefined;

  const level =
    punkt !== undefined ? 4 : stycke !== undefined ? 3 : paragraph !== undefined ? 2 : 1;
  const levelLabel: ParsedSwedishReference['levelLabel'] =
    level === 1 ? 'Kapitel' : level === 2 ? 'Paragraf' : level === 3 ? 'Stycke' : 'Punkt';

  return {
    jurisdiction: 'SE',
    entity: 'RD',
    canonical: normalized,
    law: match[1],
    chapter: Number.parseInt(match[2], 10),
    paragraph,
    stycke,
    punkt,
    level,
    levelLabel
  };
}

function parseEuCanonical(address: string, context: string): ParsedEuReference {
  const parts = address
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (parts.length < 3 || parts[0] !== 'EU' || parts[1] !== 'RD') {
    fail(
      context,
      `invalid EU reference '${address}'. Expected format EU,RD,<citation>[,rN[-M]][,chX[,secY[,artZ[,ah<slug>[,parA[,subB[,ptC[,indD]]]]]]]]`
    );
  }

  const citation = parts[2];
  if (!citation || citation.includes(',')) {
    fail(context, 'EU citation must be non-empty and cannot contain commas');
  }

  let recitalStart: number | undefined;
  let recitalEnd: number | undefined;
  let chapter: number | undefined;
  let section: number | undefined;
  let article: number | undefined;
  let articleHeadingSlug: string | undefined;
  let paragraph: number | undefined;
  let subparagraph: number | undefined;
  let point: string | undefined;
  let indent: string | undefined;

  const order = ['r', 'ch', 'sec', 'art', 'ah', 'par', 'sub', 'pt', 'ind'] as const;
  const orderIndex: Record<(typeof order)[number], number> = {
    r: 0,
    ch: 1,
    sec: 2,
    art: 3,
    ah: 4,
    par: 5,
    sub: 6,
    pt: 7,
    ind: 8
  };
  const seen = new Set<string>();
  let previous = -1;

  for (const segment of parts.slice(3)) {
    const parseSegment = (): { key: (typeof order)[number]; value: string } => {
      if (segment.startsWith('sec')) return { key: 'sec', value: segment.slice(3) };
      if (segment.startsWith('sp')) return { key: 'sub', value: segment.slice(2) };
      if (segment.startsWith('sub')) return { key: 'sub', value: segment.slice(3) };
      if (segment.startsWith('ch')) return { key: 'ch', value: segment.slice(2) };
      if (segment.startsWith('art')) return { key: 'art', value: segment.slice(3) };
      if (segment.startsWith('ah')) return { key: 'ah', value: segment.slice(2) };
      if (segment.startsWith('par')) return { key: 'par', value: segment.slice(3) };
      if (segment.startsWith('p') && !segment.startsWith('pt')) {
        return { key: 'par', value: segment.slice(1) };
      }
      if (segment.startsWith('pt')) return { key: 'pt', value: segment.slice(2) };
      if (segment.startsWith('ind')) return { key: 'ind', value: segment.slice(3) };
      if (segment.startsWith('r')) return { key: 'r', value: segment.slice(1) };
      fail(context, `unsupported EU segment '${segment}'`);
    };

    const { key, value } = parseSegment();
    const idx = orderIndex[key];
    if (idx <= previous) {
      fail(context, 'EU reference segments must be ordered by hierarchy');
    }
    previous = idx;

    if (seen.has(key)) {
      fail(context, `EU reference has duplicate segment '${key}'`);
    }
    seen.add(key);

    if (key === 'r') {
      const parsed = parseEuRecitalRange(value, context, 'recital segment');
      recitalStart = parsed.start;
      recitalEnd = parsed.end;
      continue;
    }

    if (key === 'ah') {
      articleHeadingSlug = normalizeArticleHeadingSlug(value, context);
      continue;
    }

    if (key === 'pt') {
      point = normalizeEuToken(value, context, 'point');
      continue;
    }

    if (key === 'ind') {
      indent = normalizeEuToken(value, context, 'indent');
      continue;
    }

    if (!/^\d+$/.test(value)) {
      fail(context, `EU segment '${key}' must be followed by a positive integer`);
    }
    const numeric = Number.parseInt(value, 10);
    if (!Number.isInteger(numeric) || numeric < 1) {
      fail(context, `EU segment '${key}' must be a positive integer`);
    }

    if (key === 'ch') chapter = numeric;
    if (key === 'sec') section = numeric;
    if (key === 'art') article = numeric;
    if (key === 'par') paragraph = numeric;
    if (key === 'sub') subparagraph = numeric;
  }

  if (recitalStart !== undefined) {
    if (
      chapter !== undefined ||
      section !== undefined ||
      article !== undefined ||
      articleHeadingSlug !== undefined ||
      paragraph !== undefined ||
      subparagraph !== undefined ||
      point !== undefined ||
      indent !== undefined
    ) {
      fail(context, 'recital ranges cannot be mixed with chapter/article hierarchy fields');
    }
  }

  if (section !== undefined && chapter === undefined) {
    fail(context, 'section requires chapter');
  }
  if (article !== undefined && chapter === undefined) {
    fail(context, 'article requires chapter');
  }
  if (articleHeadingSlug !== undefined && article === undefined) {
    fail(context, 'article heading requires article');
  }
  if (paragraph !== undefined && article === undefined) {
    fail(context, 'paragraph requires article');
  }
  if (subparagraph !== undefined && paragraph === undefined) {
    fail(context, 'subparagraph requires paragraph');
  }
  if (point !== undefined && paragraph === undefined) {
    fail(context, 'point requires paragraph');
  }
  if (indent !== undefined && point === undefined) {
    fail(context, 'indent requires point');
  }

  const canonicalParts = ['EU', 'RD', citation];
  if (recitalStart !== undefined) {
    canonicalParts.push(
      `r${recitalStart}${recitalEnd !== recitalStart ? `-${recitalEnd}` : ''}`
    );
  }
  if (chapter !== undefined) canonicalParts.push(`ch${chapter}`);
  if (section !== undefined) canonicalParts.push(`sec${section}`);
  if (article !== undefined) canonicalParts.push(`art${article}`);
  if (articleHeadingSlug !== undefined) canonicalParts.push(`ah${articleHeadingSlug}`);
  if (paragraph !== undefined) canonicalParts.push(`par${paragraph}`);
  if (subparagraph !== undefined) canonicalParts.push(`sub${subparagraph}`);
  if (point !== undefined) canonicalParts.push(`pt${point}`);
  if (indent !== undefined) canonicalParts.push(`ind${indent}`);

  const level = euLevelLabelFromParts({
    recitalStart,
    chapter,
    section,
    article,
    articleHeadingSlug,
    paragraph,
    subparagraph,
    point,
    indent
  });

  return {
    jurisdiction: 'EU',
    entity: 'RD',
    canonical: canonicalParts.join(','),
    citation,
    recitalStart,
    recitalEnd,
    chapter,
    section,
    article,
    articleHeadingSlug,
    paragraph,
    subparagraph,
    point,
    indent,
    level: level.level,
    levelLabel: level.label
  };
}

export function parseCanonicalReference(address: string, context = 'reference'): ParsedReference {
  const trimmed = address.trim();
  if (trimmed.startsWith('SE,')) {
    return parseSwedishCanonical(trimmed, context);
  }
  if (trimmed.startsWith('EU,')) {
    return parseEuCanonical(trimmed, context);
  }

  fail(context, `unsupported reference '${address}'. Supported prefixes: SE,RD and EU,RD`);
}

export function canonicalizeReferenceAddress(address: string, context = 'reference'): string {
  return parseCanonicalReference(address, context).canonical;
}

function normalizeInputMetadata(raw: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    normalized[key.trim().toLowerCase()] = value.trim();
  }
  return normalized;
}

function allowedKeysForJurisdiction(jurisdiction: JurisdictionCode): Set<string> {
  const template = loadJurisdictionReferenceTemplateSync(jurisdiction);
  const schema = asRecord(template.reference_schema);
  const properties = asRecord(schema?.properties);
  if (!properties) {
    return new Set(template.metadata_key_order);
  }
  return new Set(Object.keys(properties));
}

function ensureAllowedKeys(
  metadata: Record<string, string>,
  jurisdiction: JurisdictionCode,
  context: string
): void {
  const allowedKeys = allowedKeysForJurisdiction(jurisdiction);
  for (const key of Object.keys(metadata)) {
    if (!allowedKeys.has(key)) {
      fail(context, `unsupported key '${key}'`);
    }
  }
}

function validateSwedishMetadata(
  metadata: Record<string, string>,
  context: string
): Record<string, string> {
  const requiredBase = ['jurisdiction', 'entity', 'law', 'level', 'level_label', 'chapter', 'address'];
  for (const key of requiredBase) {
    if (!(key in metadata) || metadata[key].length === 0) {
      fail(context, `missing required key '${key}'`);
    }
  }

  const jurisdiction = metadata.jurisdiction.toUpperCase();
  if (jurisdiction !== 'SE') {
    fail(context, `jurisdiction must be 'SE'`);
  }
  const entity = metadata.entity.toUpperCase();
  if (entity !== 'RD') {
    fail(context, `entity must be 'RD'`);
  }

  const law = metadata.law;
  if (!/^\d{4}:\d+$/.test(law)) {
    fail(context, "law must match pattern 'YYYY:NNN'");
  }

  const level = parsePositiveInteger(metadata.level, context, 'level');
  if (level < 1 || level > 4) {
    fail(context, 'level must be between 1 and 4 for Sweden');
  }

  const chapter = parsePositiveInteger(metadata.chapter, context, 'chapter');
  const paragraph = parseOptionalPositiveInteger(metadata.paragraph, context, 'paragraph');
  const stycke = parseOptionalPositiveInteger(metadata.stycke, context, 'stycke');
  const punkt = parseOptionalPositiveInteger(metadata.punkt, context, 'punkt');

  if (level >= 2 && paragraph === undefined) {
    fail(context, `paragraph is required for level=${level}`);
  }
  if (level < 2 && paragraph !== undefined) {
    fail(context, 'paragraph is not allowed for level=1');
  }

  if (level >= 3 && stycke === undefined) {
    fail(context, `stycke is required for level=${level}`);
  }
  if (level < 3 && stycke !== undefined) {
    fail(context, `stycke is not allowed for level=${level}`);
  }

  if (level >= 4 && punkt === undefined) {
    fail(context, `punkt is required for level=${level}`);
  }
  if (level < 4 && punkt !== undefined) {
    fail(context, `punkt is not allowed for level=${level}`);
  }

  const expectedLabel =
    level === 1 ? 'Kapitel' : level === 2 ? 'Paragraf' : level === 3 ? 'Stycke' : 'Punkt';
  if (metadata.level_label !== expectedLabel) {
    fail(context, `level_label must be '${expectedLabel}' for level=${level}`);
  }

  const canonical = toSwedishCanonical(law, chapter, paragraph, stycke, punkt);
  const parsedAddress = parseCanonicalReference(metadata.address, `${context}.address`);
  if (parsedAddress.jurisdiction !== 'SE') {
    fail(context, 'address jurisdiction must be SE');
  }
  if (parsedAddress.canonical !== canonical) {
    fail(context, `address '${metadata.address}' does not match metadata components`);
  }

  const normalized: Record<string, string> = {
    jurisdiction: 'SE',
    entity: 'RD',
    law,
    level: String(level),
    level_label: expectedLabel,
    chapter: String(chapter),
    address: canonical
  };
  if (paragraph !== undefined) {
    normalized.paragraph = String(paragraph);
  }
  if (stycke !== undefined) {
    normalized.stycke = String(stycke);
  }
  if (punkt !== undefined) {
    normalized.punkt = String(punkt);
  }

  return normalized;
}

function validateEuMetadata(
  metadata: Record<string, string>,
  context: string
): Record<string, string> {
  const requiredBase = ['jurisdiction', 'entity', 'citation', 'level', 'level_label', 'address'];
  for (const key of requiredBase) {
    if (!(key in metadata) || metadata[key].length === 0) {
      fail(context, `missing required key '${key}'`);
    }
  }

  const jurisdiction = metadata.jurisdiction.toUpperCase();
  if (jurisdiction !== 'EU') {
    fail(context, `jurisdiction must be 'EU'`);
  }
  const entity = metadata.entity.toUpperCase();
  if (entity !== 'RD') {
    fail(context, `entity must be 'RD'`);
  }

  const citation = metadata.citation;
  if (!citation || citation.includes(',')) {
    fail(context, 'citation must be non-empty and cannot contain commas');
  }

  const recitalRange = metadata.recitals
    ? parseEuRecitalRange(metadata.recitals, context, 'recitals')
    : undefined;
  const chapter = parseOptionalPositiveInteger(metadata.chapter, context, 'chapter');
  const section = parseOptionalPositiveInteger(metadata.section, context, 'section');
  const article = parseOptionalPositiveInteger(metadata.article, context, 'article');
  const articleHeadingSlug = metadata.article_heading
    ? normalizeArticleHeadingSlug(metadata.article_heading, context)
    : undefined;
  const paragraph = parseOptionalPositiveInteger(metadata.paragraph, context, 'paragraph');
  const subparagraph = parseOptionalPositiveInteger(
    metadata.subparagraph,
    context,
    'subparagraph'
  );
  const point = metadata.point ? normalizeEuToken(metadata.point, context, 'point') : undefined;
  const indent = metadata.indent
    ? normalizeEuToken(metadata.indent, context, 'indent')
    : undefined;

  if (
    recitalRange &&
    (chapter !== undefined ||
      section !== undefined ||
      article !== undefined ||
      articleHeadingSlug !== undefined ||
      paragraph !== undefined ||
      subparagraph !== undefined ||
      point !== undefined ||
      indent !== undefined)
  ) {
    fail(context, 'recitals cannot be combined with chapter/section/article hierarchy keys');
  }

  if (section !== undefined && chapter === undefined) {
    fail(context, 'section requires chapter');
  }
  if (article !== undefined && chapter === undefined) {
    fail(context, 'article requires chapter');
  }
  if (articleHeadingSlug !== undefined && article === undefined) {
    fail(context, 'article_heading requires article');
  }
  if (paragraph !== undefined && article === undefined) {
    fail(context, 'paragraph requires article');
  }
  if (subparagraph !== undefined && paragraph === undefined) {
    fail(context, 'subparagraph requires paragraph');
  }
  if (point !== undefined && paragraph === undefined) {
    fail(context, 'point requires paragraph');
  }
  if (indent !== undefined && point === undefined) {
    fail(context, 'indent requires point');
  }

  const canonicalParts = ['EU', 'RD', citation];
  if (recitalRange) {
    canonicalParts.push(
      `r${recitalRange.start}${
        recitalRange.end !== recitalRange.start ? `-${recitalRange.end}` : ''
      }`
    );
  }
  if (chapter !== undefined) {
    canonicalParts.push(`ch${chapter}`);
  }
  if (section !== undefined) {
    canonicalParts.push(`sec${section}`);
  }
  if (article !== undefined) {
    canonicalParts.push(`art${article}`);
  }
  if (articleHeadingSlug !== undefined) {
    canonicalParts.push(`ah${articleHeadingSlug}`);
  }
  if (paragraph !== undefined) {
    canonicalParts.push(`par${paragraph}`);
  }
  if (subparagraph !== undefined) {
    canonicalParts.push(`sub${subparagraph}`);
  }
  if (point !== undefined) {
    canonicalParts.push(`pt${point}`);
  }
  if (indent !== undefined) {
    canonicalParts.push(`ind${indent}`);
  }

  const canonical = canonicalParts.join(',');
  const parsedAddress = parseCanonicalReference(metadata.address, `${context}.address`);
  if (parsedAddress.jurisdiction !== 'EU') {
    fail(context, 'address jurisdiction must be EU');
  }
  if (parsedAddress.canonical !== canonical) {
    fail(context, `address '${metadata.address}' does not match metadata components`);
  }

  const expected = euLevelLabelFromParts({
    recitalStart: recitalRange?.start,
    chapter,
    section,
    article,
    articleHeadingSlug,
    paragraph,
    subparagraph,
    point,
    indent
  });

  const level = parsePositiveInteger(metadata.level, context, 'level');
  if (level !== expected.level) {
    fail(context, `level must be ${expected.level} for the provided EU hierarchy`);
  }
  if (metadata.level_label !== expected.label) {
    fail(context, `level_label must be '${expected.label}' for the provided EU hierarchy`);
  }

  const normalized: Record<string, string> = {
    jurisdiction: 'EU',
    entity: 'RD',
    citation,
    level: String(expected.level),
    level_label: expected.label,
    address: canonical
  };
  if (recitalRange) {
    normalized.recitals =
      recitalRange.start === recitalRange.end
        ? String(recitalRange.start)
        : `${recitalRange.start}-${recitalRange.end}`;
  }
  if (chapter !== undefined) {
    normalized.chapter = String(chapter);
  }
  if (section !== undefined) {
    normalized.section = String(section);
  }
  if (article !== undefined) {
    normalized.article = String(article);
  }
  if (articleHeadingSlug !== undefined) {
    normalized.article_heading = articleHeadingSlug;
  }
  if (paragraph !== undefined) {
    normalized.paragraph = String(paragraph);
  }
  if (subparagraph !== undefined) {
    normalized.subparagraph = String(subparagraph);
  }
  if (point !== undefined) {
    normalized.point = point;
  }
  if (indent !== undefined) {
    normalized.indent = indent;
  }

  return normalized;
}

export function validateReferenceMetadataBlock(
  rawMetadata: Record<string, string>,
  context = 'metadata'
): Record<string, string> {
  const metadata = normalizeInputMetadata(rawMetadata);
  if (!metadata.jurisdiction) {
    fail(context, "missing required key 'jurisdiction'");
  }

  const jurisdiction = metadata.jurisdiction.toUpperCase();
  if (jurisdiction !== 'SE' && jurisdiction !== 'EU') {
    fail(context, `unsupported jurisdiction '${metadata.jurisdiction}'`);
  }

  ensureAllowedKeys(metadata, jurisdiction, context);

  if (jurisdiction === 'SE') {
    return validateSwedishMetadata(metadata, context);
  }

  return validateEuMetadata(metadata, context);
}

export function referenceMetadataFromCanonicalAddress(address: string): Record<string, string> {
  const parsed = parseCanonicalReference(address);

  if (parsed.jurisdiction === 'SE') {
    const metadata: Record<string, string> = {
      jurisdiction: 'SE',
      entity: 'RD',
      law: parsed.law,
      level: String(parsed.level),
      level_label: parsed.levelLabel,
      chapter: String(parsed.chapter),
      address: parsed.canonical
    };
    if (parsed.paragraph !== undefined) {
      metadata.paragraph = String(parsed.paragraph);
    }
    if (parsed.stycke !== undefined) {
      metadata.stycke = String(parsed.stycke);
    }
    if (parsed.punkt !== undefined) {
      metadata.punkt = String(parsed.punkt);
    }
    return metadata;
  }

  const metadata: Record<string, string> = {
    jurisdiction: 'EU',
    entity: 'RD',
    citation: parsed.citation,
    level: String(parsed.level),
    level_label: parsed.levelLabel,
    address: parsed.canonical
  };
  if (parsed.recitalStart !== undefined) {
    metadata.recitals =
      parsed.recitalEnd !== undefined && parsed.recitalEnd !== parsed.recitalStart
        ? `${parsed.recitalStart}-${parsed.recitalEnd}`
        : String(parsed.recitalStart);
  }
  if (parsed.chapter !== undefined) {
    metadata.chapter = String(parsed.chapter);
  }
  if (parsed.section !== undefined) {
    metadata.section = String(parsed.section);
  }
  if (parsed.article !== undefined) {
    metadata.article = String(parsed.article);
  }
  if (parsed.articleHeadingSlug !== undefined) {
    metadata.article_heading = parsed.articleHeadingSlug;
  }
  if (parsed.paragraph !== undefined) {
    metadata.paragraph = String(parsed.paragraph);
  }
  if (parsed.subparagraph !== undefined) {
    metadata.subparagraph = String(parsed.subparagraph);
  }
  if (parsed.point !== undefined) {
    metadata.point = parsed.point;
  }
  if (parsed.indent !== undefined) {
    metadata.indent = parsed.indent;
  }

  return metadata;
}

export function formatReferenceMetadataLines(metadata: Record<string, string>): string[] {
  const normalized = validateReferenceMetadataBlock(metadata);
  const jurisdiction = normalized.jurisdiction as JurisdictionCode;
  const template = loadJurisdictionReferenceTemplateSync(jurisdiction);
  const orderedKeys = template.metadata_key_order;

  const lines: string[] = [];
  for (const key of orderedKeys) {
    if (normalized[key] !== undefined) {
      lines.push(`- ${key}: ${normalized[key]}`);
    }
  }
  return lines;
}

export function formatReferenceBlocksFromAddresses(addresses: string[]): string[] {
  const canonicalAddresses = Array.from(
    new Set(addresses.map((entry) => canonicalizeReferenceAddress(entry)))
  ).sort((a, b) => a.localeCompare(b));

  const lines: string[] = [];
  canonicalAddresses.forEach((address, index) => {
    lines.push(`### ref_${index + 1}`);
    lines.push('');
    lines.push(...formatReferenceMetadataLines(referenceMetadataFromCanonicalAddress(address)));
    lines.push('');
  });

  return lines;
}

export function jurisdictionDirectoryName(jurisdiction: JurisdictionCode): string {
  return jurisdiction === 'SE' ? 'Sweden' : 'EU';
}

export function referenceHierarchyFromAddress(address: string): {
  jurisdictionName: string;
  lawName: string;
  nodes: ReferenceHierarchyNode[];
} {
  const parsed = parseCanonicalReference(address);

  if (parsed.jurisdiction === 'SE') {
    const nodes: ReferenceHierarchyNode[] = [{ level: 1, name: `Kapitel_${parsed.chapter}` }];
    if (parsed.paragraph !== undefined) {
      nodes.push({ level: 2, name: `Paragraf_${parsed.paragraph}` });
    }
    if (parsed.stycke !== undefined) {
      nodes.push({ level: 3, name: `Stycke_${parsed.stycke}` });
    }
    if (parsed.punkt !== undefined) {
      nodes.push({ level: 4, name: `Punkt_${parsed.punkt}` });
    }

    return {
      jurisdictionName: 'Sweden',
      lawName: parsed.law,
      nodes
    };
  }

  const euNodes: ReferenceHierarchyNode[] = [];
  if (parsed.recitalStart !== undefined) {
    const suffix =
      parsed.recitalEnd !== undefined && parsed.recitalEnd !== parsed.recitalStart
        ? `${parsed.recitalStart}-${parsed.recitalEnd}`
        : String(parsed.recitalStart);
    euNodes.push({ level: 1, name: `Recitals_${suffix}` });
  } else {
    if (parsed.chapter !== undefined) {
      euNodes.push({ level: 1, name: `Chapter_${parsed.chapter}` });
    }
    if (parsed.section !== undefined) {
      euNodes.push({ level: 2, name: `Section_${parsed.section}` });
    }
    if (parsed.article !== undefined) {
      euNodes.push({ level: 3, name: `Article_${parsed.article}` });
    }
    if (parsed.paragraph !== undefined) {
      euNodes.push({ level: 4, name: `Paragraph_${parsed.paragraph}` });
    }
    if (parsed.subparagraph !== undefined) {
      euNodes.push({ level: 5, name: `Subparagraph_${parsed.subparagraph}` });
    }
    if (parsed.point !== undefined) {
      euNodes.push({ level: 6, name: `Point_${parsed.point}` });
    }
    if (parsed.indent !== undefined) {
      euNodes.push({ level: 7, name: `Indent_${parsed.indent}` });
    }
  }

  if (euNodes.length === 0) {
    euNodes.push({ level: 1, name: 'Citation' });
  }

  return {
    jurisdictionName: 'EU',
    lawName: parsed.citation,
    nodes: euNodes
  };
}
