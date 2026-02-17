import fs from "fs-extra";
import path from "node:path";

import {
  extractMarkdownSections,
  globMarkdown,
  parseBulletList,
  parseKeyValueBullets,
  parseSubsectionBlocks,
} from "./structured_markdown.js";
import {
  isCanonicalConceptIdentifier,
  normalizeConceptIdentifier,
} from "./concept_identifier.js";
import { toPosixRelative } from "./io.js";
import {
  parseCanonicalReference as parseCanonicalReferenceContract,
  validateReferenceMetadataBlock,
} from "./reference_contract.js";

export interface TopicMappingRow {
  topic: string;
  addresses: string[];
}

export interface IsSubtopicRow {
  subtopic: string;
  parentTopic: string;
}

export interface StatutoryViolationRow {
  actionReference: string;
  statutoryReference: string;
}

export interface InferenceRelationBundle {
  isSubtopics: IsSubtopicRow[];
  topicMappings: TopicMappingRow[];
  statutoryViolations: StatutoryViolationRow[];
}

interface ConceptDoc {
  filePath: string;
  conceptId: string;
  conceptSlug: string;
  kind: "concept" | "subconcept";
  parentConceptId?: string;
  references: string[];
  subconcepts: string[];
}

interface ProvisionDoc {
  filePath: string;
  address: string;
  topics: string[];
  metadata: Record<string, string>;
}

interface EnforcementDoc {
  filePath: string;
  referenceId: string;
  statutoryReferences: string[];
}

const SWEDISH_REFERENCE_PATTERN =
  /^SE,RD,(\d{4}:\d+),k(\d+)(?:,p(\d+)(?:,s(\d+)(?:,pt(\d+))?)?)?$/;
const ENFORCEMENT_REFERENCE_PATTERN = /^SE,FI,[A-Z0-9_]+,[A-Za-z0-9:_-]+$/;
const CANONICAL_REFERENCE_BULLET_PATTERN = /^-\s*((?:SE|EU),RD,.+)\s*$/;
const STRUCTURED_SWEDEN_HEADER_PATTERN = /^(?:-\s*)?sweden:\s*$/i;
const STRUCTURED_EU_HEADER_PATTERN = /^(?:-\s*)?eu:\s*$/i;

interface StructuredSwedishConceptReferenceBlock {
  law?: string;
  chapter?: number;
  paragraph?: number;
  stycke?: number;
  punkt?: number;
}

interface StructuredEuConceptReferenceBlock {
  citation?: string;
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
}

interface ParsedSwedishReference {
  jurisdiction: "SE";
  authority: "RD";
  canonical: string;
  law: string;
  chapter: number;
  paragraph?: number;
  stycke?: number;
  punkt?: number;
}

interface ParsedEuReference {
  jurisdiction: "EU";
  entity: "RD";
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
}

type ParsedReference = ParsedSwedishReference | ParsedEuReference;

function readDoc(filePath: string): Record<string, string> {
  const raw = fs.readFileSync(filePath, "utf8");
  return extractMarkdownSections(raw);
}

function fail(filePath: string, message: string): never {
  throw new Error(`${toPosixRelative(filePath)}: ${message}`);
}

function parseNonEmptyKeyValueSection(
  sectionBody: string,
  filePath: string,
  sectionName: string
): Record<string, string> {
  const parsed = parseKeyValueBullets(sectionBody, filePath, sectionName);
  for (const [key, value] of Object.entries(parsed)) {
    if (value.trim().length === 0) {
      fail(
        filePath,
        `section '${sectionName}' key '${key}' cannot be empty; omit non-applicable keys`
      );
    }
  }
  return parsed;
}

function parseSwedishReference(
  address: string,
  filePath: string,
  context: string
): ParsedSwedishReference {
  const normalized = address.trim();
  const match = normalized.match(SWEDISH_REFERENCE_PATTERN);
  if (!match) {
    fail(
      filePath,
      `${context} has invalid reference '${address}'. Expected format SE,RD,2017:630,kX[,pY[,sZ[,ptW]]]`
    );
  }

  return {
    jurisdiction: "SE",
    authority: "RD",
    canonical: normalized,
    law: match[1],
    chapter: Number.parseInt(match[2], 10),
    paragraph: match[3] ? Number.parseInt(match[3], 10) : undefined,
    stycke: match[4] ? Number.parseInt(match[4], 10) : undefined,
    punkt: match[5] ? Number.parseInt(match[5], 10) : undefined,
  };
}

function parsePositiveIntWithOptionalPrefix(
  rawValue: string,
  componentName: string,
  prefix: string,
  filePath: string,
  context: string
): number {
  const normalized = rawValue.trim().toLowerCase();
  const numericPart = normalized.startsWith(prefix)
    ? normalized.slice(prefix.length)
    : normalized;

  if (!/^\d+$/.test(numericPart)) {
    fail(
      filePath,
      `${context} field '${componentName}' must be a positive integer or '${prefix}N' (received '${rawValue}')`
    );
  }

  const value = Number.parseInt(numericPart, 10);
  if (!Number.isInteger(value) || value < 1) {
    fail(
      filePath,
      `${context} field '${componentName}' must be a positive integer`
    );
  }
  return value;
}

function parsePositiveIntWithOptionalPrefixes(
  rawValue: string,
  componentName: string,
  prefixes: string[],
  filePath: string,
  context: string
): number {
  const normalized = rawValue.trim().toLowerCase();
  let numericPart = normalized;

  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      numericPart = normalized.slice(prefix.length);
      break;
    }
  }

  if (!/^\d+$/.test(numericPart)) {
    fail(
      filePath,
      `${context} field '${componentName}' must be a positive integer or one of: ${prefixes
        .map((prefix) => `'${prefix}N'`)
        .join(", ")}`
    );
  }

  const value = Number.parseInt(numericPart, 10);
  if (!Number.isInteger(value) || value < 1) {
    fail(
      filePath,
      `${context} field '${componentName}' must be a positive integer`
    );
  }
  return value;
}

function parseOptionalPositiveIntWithPrefixes(
  metadata: Record<string, string>,
  key: string,
  prefixes: string[],
  filePath: string,
  context: string
): number | undefined {
  if (!(key in metadata)) {
    return undefined;
  }

  const raw = metadata[key].trim().toLowerCase();
  if (!raw) {
    fail(filePath, `${context} key '${key}' cannot be empty`);
  }

  let numericPart = raw;
  for (const prefix of prefixes) {
    if (raw.startsWith(prefix)) {
      numericPart = raw.slice(prefix.length);
      break;
    }
  }

  if (!/^\d+$/.test(numericPart)) {
    fail(
      filePath,
      `${context} key '${key}' must be a positive integer or one of: ${prefixes.join(
        ", "
      )}`
    );
  }

  const value = Number.parseInt(numericPart, 10);
  if (!Number.isInteger(value) || value < 1) {
    fail(filePath, `${context} key '${key}' must be a positive integer`);
  }

  return value;
}

function parseEuRecitalRange(
  rawValue: string,
  filePath: string,
  context: string
): { start: number; end: number } {
  let normalized = rawValue.trim().toLowerCase().replace(/\s+/g, "");
  if (normalized.startsWith("r")) {
    normalized = normalized.slice(1);
  }

  const match = normalized.match(/^(\d+)(?:-(\d+))?$/);
  if (!match) {
    fail(filePath, `${context} must be in form 'N' or 'N-M' (e.g. 1-25)`);
  }

  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : start;

  if (start < 1 || end < 1 || start > 175 || end > 175 || end < start) {
    fail(
      filePath,
      `${context} must be within recital range 1-175 and have start <= end`
    );
  }

  return { start, end };
}

function normalizeArticleHeadingSlug(
  value: string,
  filePath: string,
  context: string
): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) {
    fail(
      filePath,
      `${context} must contain at least one alphanumeric character`
    );
  }
  return slug;
}

function parseEuToken(
  rawValue: string,
  componentName: string,
  prefixes: string[],
  filePath: string,
  context: string
): string {
  let normalized = rawValue.trim().toLowerCase();
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }

  normalized = normalized
    .replace(/^\(+/, "")
    .replace(/\)+$/, "")
    .replace(/[.)]+$/, "")
    .trim()
    .toLowerCase();

  if (!/^[a-z0-9]+$/.test(normalized)) {
    fail(
      filePath,
      `${context} field '${componentName}' must be an alphanumeric token (examples: a, b, 1, ii)`
    );
  }

  return normalized;
}

function parseEuReference(
  address: string,
  filePath: string,
  context: string
): ParsedEuReference {
  const parts = address
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (parts.length < 3 || parts[0] !== "EU" || parts[1] !== "RD") {
    fail(
      filePath,
      `${context} has invalid EU reference '${address}'. Expected format EU,RD,<citation>[,rN[-M]][,chX[,secY[,artZ[,ah<slug>[,parA[,subB[,ptC[,indD]]]]]]]]`
    );
  }

  const citation = parts[2];
  if (!citation || citation.includes(",")) {
    fail(
      filePath,
      `${context} EU citation must be non-empty and cannot contain commas`
    );
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

  const seen = new Set<string>();
  const order = [
    "r",
    "ch",
    "sec",
    "art",
    "ah",
    "par",
    "sub",
    "pt",
    "ind",
  ] as const;
  const orderIndex: Record<(typeof order)[number], number> = {
    r: 0,
    ch: 1,
    sec: 2,
    art: 3,
    ah: 4,
    par: 5,
    sub: 6,
    pt: 7,
    ind: 8,
  };
  let previous = -1;

  for (const segment of parts.slice(3)) {
    const parseSegment = (): { key: (typeof order)[number]; value: string } => {
      if (segment.startsWith("sec"))
        return { key: "sec", value: segment.slice(3) };
      if (segment.startsWith("sp"))
        return { key: "sub", value: segment.slice(2) };
      if (segment.startsWith("sub"))
        return { key: "sub", value: segment.slice(3) };
      if (segment.startsWith("ch"))
        return { key: "ch", value: segment.slice(2) };
      if (segment.startsWith("art"))
        return { key: "art", value: segment.slice(3) };
      if (segment.startsWith("ah"))
        return { key: "ah", value: segment.slice(2) };
      if (segment.startsWith("par"))
        return { key: "par", value: segment.slice(3) };
      if (segment.startsWith("p") && !segment.startsWith("pt"))
        return { key: "par", value: segment.slice(1) };
      if (segment.startsWith("pt"))
        return { key: "pt", value: segment.slice(2) };
      if (segment.startsWith("ind"))
        return { key: "ind", value: segment.slice(3) };
      if (segment.startsWith("r")) return { key: "r", value: segment.slice(1) };
      fail(filePath, `${context} has unsupported EU segment '${segment}'`);
    };

    const { key, value } = parseSegment();
    const idx = orderIndex[key];
    if (idx <= previous) {
      fail(
        filePath,
        `${context} EU reference segments must be ordered by hierarchy`
      );
    }
    previous = idx;

    if (seen.has(key)) {
      fail(filePath, `${context} EU reference has duplicate segment '${key}'`);
    }
    seen.add(key);

    if (key === "r") {
      const parsed = parseEuRecitalRange(
        value,
        filePath,
        `${context} recital segment`
      );
      recitalStart = parsed.start;
      recitalEnd = parsed.end;
      continue;
    }

    if (key === "ah") {
      articleHeadingSlug = normalizeArticleHeadingSlug(
        value,
        filePath,
        `${context} article heading segment`
      );
      continue;
    }

    if (key === "pt" || key === "ind") {
      const token = parseEuToken(
        value,
        key === "pt" ? "point" : "indent",
        [""],
        filePath,
        `${context} ${key === "pt" ? "point" : "indent"} segment`
      );
      if (key === "pt") {
        point = token;
      } else {
        indent = token;
      }
      continue;
    }

    if (!/^\d+$/.test(value)) {
      fail(
        filePath,
        `${context} EU segment '${key}' must be followed by a positive integer`
      );
    }
    const numeric = Number.parseInt(value, 10);
    if (!Number.isInteger(numeric) || numeric < 1) {
      fail(
        filePath,
        `${context} EU segment '${key}' must be a positive integer`
      );
    }

    if (key === "ch") chapter = numeric;
    if (key === "sec") section = numeric;
    if (key === "art") article = numeric;
    if (key === "par") paragraph = numeric;
    if (key === "sub") subparagraph = numeric;
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
      fail(
        filePath,
        `${context} recital ranges cannot be mixed with chapter/article hierarchy fields`
      );
    }
  }

  if (section !== undefined && chapter === undefined) {
    fail(filePath, `${context} section requires chapter`);
  }
  if (article !== undefined && chapter === undefined) {
    fail(filePath, `${context} article requires chapter`);
  }
  if (articleHeadingSlug !== undefined && article === undefined) {
    fail(filePath, `${context} article heading requires article`);
  }
  if (paragraph !== undefined && article === undefined) {
    fail(filePath, `${context} paragraph requires article`);
  }
  if (subparagraph !== undefined && paragraph === undefined) {
    fail(filePath, `${context} subparagraph requires paragraph`);
  }
  if (point !== undefined && paragraph === undefined) {
    fail(filePath, `${context} point requires paragraph`);
  }
  if (indent !== undefined && point === undefined) {
    fail(filePath, `${context} indent requires point`);
  }

  const canonicalParts = ["EU", "RD", citation];
  if (recitalStart !== undefined) {
    canonicalParts.push(
      `r${recitalStart}${recitalEnd !== recitalStart ? `-${recitalEnd}` : ""}`
    );
  }
  if (chapter !== undefined) canonicalParts.push(`ch${chapter}`);
  if (section !== undefined) canonicalParts.push(`sec${section}`);
  if (article !== undefined) canonicalParts.push(`art${article}`);
  if (articleHeadingSlug !== undefined)
    canonicalParts.push(`ah${articleHeadingSlug}`);
  if (paragraph !== undefined) canonicalParts.push(`par${paragraph}`);
  if (subparagraph !== undefined) canonicalParts.push(`sub${subparagraph}`);
  if (point !== undefined) canonicalParts.push(`pt${point}`);
  if (indent !== undefined) canonicalParts.push(`ind${indent}`);

  return {
    jurisdiction: "EU",
    entity: "RD",
    canonical: canonicalParts.join(","),
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
  };
}

function parseCanonicalReference(
  address: string,
  filePath: string,
  context: string
): ParsedReference {
  const normalized = address.trim();
  if (normalized.startsWith("SE,")) {
    return parseSwedishReference(normalized, filePath, context);
  }
  if (normalized.startsWith("EU,")) {
    return parseEuReference(normalized, filePath, context);
  }

  fail(
    filePath,
    `${context} has unsupported jurisdiction in reference '${address}'. Supported canonical prefixes: SE,RD and EU,RD`
  );
}

function buildSwedishReferenceFromStructuredBlock(
  block: StructuredSwedishConceptReferenceBlock,
  filePath: string,
  context: string
): string {
  if (!block.law) {
    fail(filePath, `${context} is missing required field 'Law'`);
  }
  if (block.chapter === undefined) {
    fail(filePath, `${context} is missing required field 'Kapitel'`);
  }
  if (block.stycke !== undefined && block.paragraph === undefined) {
    fail(filePath, `${context}: 'Stycke' requires 'Paragraph'`);
  }
  if (block.punkt !== undefined && block.stycke === undefined) {
    fail(filePath, `${context}: 'Punkt' requires 'Stycke'`);
  }

  const parts = [`SE,RD,${block.law}`, `k${block.chapter}`];
  if (block.paragraph !== undefined) {
    parts.push(`p${block.paragraph}`);
  }
  if (block.stycke !== undefined) {
    parts.push(`s${block.stycke}`);
  }
  if (block.punkt !== undefined) {
    parts.push(`pt${block.punkt}`);
  }

  const canonical = parts.join(",");
  return parseSwedishReference(
    canonical,
    filePath,
    `${context} canonical reference`
  ).canonical;
}

function buildEuReferenceFromStructuredBlock(
  block: StructuredEuConceptReferenceBlock,
  filePath: string,
  context: string
): string {
  if (!block.citation) {
    fail(filePath, `${context} is missing required field 'Citation'`);
  }
  if (block.citation.includes(",")) {
    fail(filePath, `${context} field 'Citation' cannot contain commas`);
  }

  if (block.recitalStart !== undefined) {
    if (
      block.chapter !== undefined ||
      block.section !== undefined ||
      block.article !== undefined ||
      block.articleHeadingSlug !== undefined ||
      block.paragraph !== undefined ||
      block.subparagraph !== undefined ||
      block.point !== undefined ||
      block.indent !== undefined
    ) {
      fail(
        filePath,
        `${context}: recital ranges cannot be combined with chapter/article hierarchy fields`
      );
    }
  }

  if (block.section !== undefined && block.chapter === undefined) {
    fail(filePath, `${context}: 'Section' requires 'Chapter'`);
  }
  if (block.article !== undefined && block.chapter === undefined) {
    fail(filePath, `${context}: 'Article' requires 'Chapter'`);
  }
  if (block.articleHeadingSlug !== undefined && block.article === undefined) {
    fail(filePath, `${context}: 'Article Heading' requires 'Article'`);
  }
  if (block.paragraph !== undefined && block.article === undefined) {
    fail(filePath, `${context}: 'Paragraph' requires 'Article'`);
  }
  if (block.subparagraph !== undefined && block.paragraph === undefined) {
    fail(filePath, `${context}: 'Subparagraph' requires 'Paragraph'`);
  }
  if (block.point !== undefined && block.paragraph === undefined) {
    fail(filePath, `${context}: 'Point' requires 'Paragraph'`);
  }
  if (block.indent !== undefined && block.point === undefined) {
    fail(filePath, `${context}: 'Indent' requires 'Point'`);
  }

  const parts = ["EU", "RD", block.citation];
  if (block.recitalStart !== undefined) {
    parts.push(
      `r${block.recitalStart}${
        block.recitalEnd !== block.recitalStart ? `-${block.recitalEnd}` : ""
      }`
    );
  }
  if (block.chapter !== undefined) {
    parts.push(`ch${block.chapter}`);
  }
  if (block.section !== undefined) {
    parts.push(`sec${block.section}`);
  }
  if (block.article !== undefined) {
    parts.push(`art${block.article}`);
  }
  if (block.articleHeadingSlug !== undefined) {
    parts.push(`ah${block.articleHeadingSlug}`);
  }
  if (block.paragraph !== undefined) {
    parts.push(`par${block.paragraph}`);
  }
  if (block.subparagraph !== undefined) {
    parts.push(`sub${block.subparagraph}`);
  }
  if (block.point !== undefined) {
    parts.push(`pt${block.point}`);
  }
  if (block.indent !== undefined) {
    parts.push(`ind${block.indent}`);
  }

  const canonical = parts.join(",");
  return parseEuReference(canonical, filePath, `${context} canonical reference`)
    .canonical;
}

export function parseConceptReferencesSection(
  sectionBody: string,
  filePath: string
): string[] {
  const trimmed = sectionBody.trim();
  if (!trimmed) {
    return [];
  }

  const blocks = parseSubsectionBlocks(sectionBody, filePath, "references");
  const addresses = new Set<string>();

  for (const [name, rawBlock] of Object.entries(blocks)) {
    const metadata = parseNonEmptyKeyValueSection(
      rawBlock,
      filePath,
      `references.${name}`
    );

    let normalized: Record<string, string>;
    try {
      normalized = validateReferenceMetadataBlock(
        metadata,
        `references.${name}`
      );
    } catch (error) {
      fail(filePath, error instanceof Error ? error.message : String(error));
    }

    try {
      const canonical = parseCanonicalReferenceContract(
        normalized.address,
        `references.${name}.address`
      ).canonical;
      addresses.add(canonical);
    } catch (error) {
      fail(filePath, error instanceof Error ? error.message : String(error));
    }
  }

  return Array.from(addresses).sort((a, b) => a.localeCompare(b));
}

function parseRequiredPositiveInt(
  metadata: Record<string, string>,
  key: string,
  filePath: string,
  context: string
): number {
  if (!(key in metadata)) {
    fail(filePath, `${context} is missing required key '${key}'`);
  }
  const value = Number.parseInt(metadata[key], 10);
  if (!Number.isInteger(value) || value < 1) {
    fail(filePath, `${context} key '${key}' must be a positive integer`);
  }
  return value;
}

function maybePositiveInt(
  metadata: Record<string, string>,
  key: string,
  filePath: string,
  context: string
): number | undefined {
  if (!(key in metadata)) {
    return undefined;
  }
  const value = Number.parseInt(metadata[key], 10);
  if (!Number.isInteger(value) || value < 1) {
    fail(
      filePath,
      `${context} key '${key}' must be a positive integer when present`
    );
  }
  return value;
}

function ensureNoUnexpectedKeys(
  metadata: Record<string, string>,
  allowed: Set<string>,
  filePath: string,
  sectionName: string
): void {
  for (const key of Object.keys(metadata)) {
    if (!allowed.has(key)) {
      fail(filePath, `section '${sectionName}' has unsupported key '${key}'`);
    }
  }
}

function normalizeAndValidateConceptId(
  value: string,
  filePath: string,
  context: string
): string {
  const raw = value.trim();
  if (!raw) {
    fail(filePath, `${context} is required`);
  }
  const normalized = normalizeConceptIdentifier(raw);
  if (!isCanonicalConceptIdentifier(normalized)) {
    fail(
      filePath,
      `${context} must normalize to snake_case (e.g. general_risk_assessment)`
    );
  }
  return normalized;
}

function normalizeAndValidateConceptSlug(
  value: string,
  filePath: string,
  context: string
): string {
  const raw = value.trim();
  if (!raw) {
    fail(filePath, `${context} is required`);
  }
  const normalized = normalizeConceptIdentifier(raw);
  if (!isCanonicalConceptIdentifier(normalized)) {
    fail(
      filePath,
      `${context} must normalize to snake_case (e.g. general_risk_assessment)`
    );
  }
  return normalized;
}

function failConceptCollision(docs: ConceptDoc[], message: string): never {
  const sorted = [...docs].sort((a, b) => a.filePath.localeCompare(b.filePath));
  const lines = [message, ...sorted.map((doc) => `- ${toPosixRelative(doc.filePath)}`)];
  throw new Error(lines.join("\n"));
}

function mergeConceptDocsByNormalizedId(docs: ConceptDoc[]): ConceptDoc[] {
  const grouped = new Map<string, ConceptDoc[]>();
  for (const doc of docs) {
    const list = grouped.get(doc.conceptId) ?? [];
    list.push(doc);
    grouped.set(doc.conceptId, list);
  }

  const merged: ConceptDoc[] = [];
  for (const [conceptId, group] of grouped.entries()) {
    const sortedGroup = [...group].sort((a, b) => a.filePath.localeCompare(b.filePath));
    const canonical = sortedGroup[0];

    const kinds = new Set(sortedGroup.map((doc) => doc.kind));
    if (kinds.size > 1) {
      failConceptCollision(
        sortedGroup,
        `conflicting metadata.kind for normalized concept_id '${conceptId}'`
      );
    }

    const slugs = new Set(sortedGroup.map((doc) => doc.conceptSlug));
    if (slugs.size > 1) {
      failConceptCollision(
        sortedGroup,
        `conflicting normalized metadata.concept_slug for normalized concept_id '${conceptId}'`
      );
    }

    const parentIds = new Set(
      sortedGroup.map((doc) => doc.parentConceptId ?? "")
    );
    if (parentIds.size > 1) {
      failConceptCollision(
        sortedGroup,
        `conflicting normalized metadata.parent_concept_id for normalized concept_id '${conceptId}'`
      );
    }

    const references = Array.from(
      new Set(sortedGroup.flatMap((doc) => doc.references))
    ).sort((a, b) => a.localeCompare(b));
    const subconcepts = Array.from(
      new Set(sortedGroup.flatMap((doc) => doc.subconcepts))
    ).sort((a, b) => a.localeCompare(b));
    const normalizedParent = Array.from(parentIds)[0] || undefined;

    merged.push({
      filePath: canonical.filePath,
      conceptId: canonical.conceptId,
      conceptSlug: canonical.conceptSlug,
      kind: canonical.kind,
      parentConceptId: canonical.kind === "subconcept" ? normalizedParent : undefined,
      references,
      subconcepts,
    });
  }

  return merged.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function pairKey(conceptId: string, address: string): string {
  return `${conceptId}::${address}`;
}

function parsePairsFromConcepts(docs: ConceptDoc[]): Set<string> {
  const pairs = new Set<string>();
  for (const doc of docs) {
    for (const reference of doc.references) {
      pairs.add(pairKey(doc.conceptId, reference));
    }
  }
  return pairs;
}

function parsePairsFromProvisions(docs: ProvisionDoc[]): Set<string> {
  const pairs = new Set<string>();
  for (const doc of docs) {
    for (const topic of doc.topics) {
      pairs.add(pairKey(topic, doc.address));
    }
  }
  return pairs;
}

function sortedSetDiff(left: Set<string>, right: Set<string>): string[] {
  return Array.from(left)
    .filter((value) => !right.has(value))
    .sort((a, b) => a.localeCompare(b));
}

function parseConceptDocsFromFiles(files: string[]): ConceptDoc[] {
  const docs: ConceptDoc[] = [];

  for (const filePath of files) {
    const sections = readDoc(filePath);
    if (sections.metadata === undefined || sections.references === undefined) {
      fail(
        filePath,
        "concept/subconcept files must contain '## metadata' and '## references'"
      );
    }

    const metadata = parseNonEmptyKeyValueSection(
      sections.metadata,
      filePath,
      "metadata"
    );
    const conceptId = normalizeAndValidateConceptId(
      metadata.concept_id ?? "",
      filePath,
      "metadata.concept_id"
    );
    const conceptSlug = normalizeAndValidateConceptSlug(
      metadata.concept_slug ?? "",
      filePath,
      "metadata.concept_slug"
    );

    const inferredKind = filePath.includes(`${path.sep}subconcepts${path.sep}`)
      ? "subconcept"
      : "concept";
    const declaredKind = metadata.kind;
    if (declaredKind !== "concept" && declaredKind !== "subconcept") {
      fail(filePath, "metadata.kind must be either 'concept' or 'subconcept'");
    }
    if (declaredKind !== inferredKind) {
      fail(
        filePath,
        `metadata.kind='${declaredKind}' does not match path-derived kind '${inferredKind}'`
      );
    }

    const references = parseConceptReferencesSection(
      sections.references,
      filePath
    );

    const normalizedReferences = Array.from(
      new Set(references.map((entry) => entry.trim()))
    ).sort((a, b) => a.localeCompare(b));

    for (const address of normalizedReferences) {
      parseCanonicalReference(address, filePath, `references '${address}'`);
    }

    const subconcepts = sections.subconcepts
      ? parseBulletList(sections.subconcepts, filePath, "subconcepts").map(
          (entry) =>
            normalizeAndValidateConceptId(
              entry.trim(),
              filePath,
              `subconcept '${entry.trim()}'`
            )
        )
      : [];

    let parentConceptId: string | undefined;
    if (declaredKind === "subconcept") {
      parentConceptId = normalizeAndValidateConceptId(
        metadata.parent_concept_id ?? "",
        filePath,
        "metadata.parent_concept_id"
      );
    }

    docs.push({
      filePath,
      conceptId,
      conceptSlug,
      kind: declaredKind,
      parentConceptId,
      references: normalizedReferences,
      subconcepts,
    });
  }

  return mergeConceptDocsByNormalizedId(docs);
}

function parseProvisionDocsFromFiles(files: string[]): ProvisionDoc[] {
  const docs: ProvisionDoc[] = [];

  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, "utf8");
    if (raw.trim().length === 0) {
      // Jurisdiction map trees may include placeholder files; only validate populated provision docs.
      continue;
    }

    const sections = extractMarkdownSections(raw);
    if (sections.references === undefined || sections.topics === undefined) {
      fail(
        filePath,
        "provision files must contain '## references' and '## topics'"
      );
    }

    const referenceBlocks = parseSubsectionBlocks(
      sections.references,
      filePath,
      "references"
    );
    const blockEntries = Object.entries(referenceBlocks);
    if (blockEntries.length !== 1) {
      fail(filePath, "provision files must contain exactly one '### ref_N' block");
    }

    const [name, rawBlock] = blockEntries[0];
    const referenceMetadata = parseNonEmptyKeyValueSection(
      rawBlock,
      filePath,
      `references.${name}`
    );
    let normalizedMetadata: Record<string, string>;
    try {
      normalizedMetadata = validateReferenceMetadataBlock(
        referenceMetadata,
        `references.${name}`
      );
    } catch (error) {
      fail(filePath, error instanceof Error ? error.message : String(error));
    }

    let canonicalAddress: string;
    try {
      canonicalAddress = parseCanonicalReferenceContract(
        normalizedMetadata.address,
        `references.${name}.address`
      ).canonical;
    } catch (error) {
      fail(filePath, error instanceof Error ? error.message : String(error));
    }

    const topics = Array.from(
      new Set(
        parseBulletList(sections.topics, filePath, "topics")
          .map((entry) =>
            normalizeAndValidateConceptId(
              entry,
              filePath,
              `topic '${entry.trim()}'`
            )
          )
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));

    docs.push({
      filePath,
      address: canonicalAddress,
      topics,
      metadata: normalizedMetadata,
    });
  }

  return docs.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function parseEnforcementDocsFromFiles(files: string[]): EnforcementDoc[] {
  const docs: EnforcementDoc[] = [];

  for (const filePath of files) {
    const sections = readDoc(filePath);
    if (
      sections.record === undefined ||
      sections.statutory_references === undefined
    ) {
      fail(
        filePath,
        "enforcement examples must contain '## record' and '## statutory_references'"
      );
    }

    const record = parseNonEmptyKeyValueSection(
      sections.record,
      filePath,
      "record"
    );
    const requiredFields = [
      "reference_id",
      "diarienummer",
      "regulatory_authority",
      "affected_entity_name",
      "entity_type",
      "decision_type",
      "fine",
    ];
    for (const field of requiredFields) {
      if (!(field in record)) {
        fail(filePath, `record is missing required key '${field}'`);
      }
    }

    const referenceId = record.reference_id;
    if (!ENFORCEMENT_REFERENCE_PATTERN.test(referenceId)) {
      fail(filePath, `record.reference_id '${referenceId}' has invalid format`);
    }

    const referenceBlocks = parseSubsectionBlocks(
      sections.statutory_references,
      filePath,
      "statutory_references"
    );

    const addresses = new Set<string>();
    for (const [name, rawBlock] of Object.entries(referenceBlocks)) {
      const fields = parseNonEmptyKeyValueSection(
        rawBlock,
        filePath,
        `statutory_references.${name}`
      );
      let normalized: Record<string, string>;
      try {
        normalized = validateReferenceMetadataBlock(
          fields,
          `statutory_references.${name}`
        );
      } catch (error) {
        fail(filePath, error instanceof Error ? error.message : String(error));
      }

      let canonicalAddress: string;
      try {
        canonicalAddress = parseCanonicalReferenceContract(
          normalized.address,
          `statutory_references.${name}.address`
        ).canonical;
      } catch (error) {
        fail(filePath, error instanceof Error ? error.message : String(error));
      }

      addresses.add(canonicalAddress);
    }

    docs.push({
      filePath,
      referenceId,
      statutoryReferences: Array.from(addresses).sort((a, b) =>
        a.localeCompare(b)
      ),
    });
  }

  return docs.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

export async function loadInferenceMappingModel(): Promise<{
  concepts: ConceptDoc[];
  provisions: ProvisionDoc[];
  enforcementActions: EnforcementDoc[];
  relations: InferenceRelationBundle;
}> {
  const [conceptFiles, provisionFiles, enforcementFiles] = await Promise.all([
    globMarkdown(["library/taxonomy/AML/concepts/**/*.md"]),
    globMarkdown([
      "library/taxonomy/AML/map/Sweden/legislation/**/*.md",
      "library/taxonomy/AML/map/EU/legislation/**/*.md",
    ]),
    globMarkdown([
      "library/ontologies/document-types/enforcement-actions/jurisdictions/se/examples/enforcement-actions/*.md",
    ]),
  ]);

  const concepts = parseConceptDocsFromFiles(conceptFiles);
  const provisions = parseProvisionDocsFromFiles(provisionFiles);
  const enforcementActions = parseEnforcementDocsFromFiles(enforcementFiles);

  const subtopicPairs = new Set<string>();
  for (const concept of concepts) {
    for (const subtopic of concept.subconcepts) {
      normalizeAndValidateConceptId(
        subtopic,
        concept.filePath,
        `subconcept '${subtopic}'`
      );
      subtopicPairs.add(`${subtopic}::${concept.conceptId}`);
    }

    if (concept.kind === "subconcept" && concept.parentConceptId) {
      subtopicPairs.add(`${concept.conceptId}::${concept.parentConceptId}`);
    }
  }

  const conceptPairs = parsePairsFromConcepts(concepts);
  const provisionPairs = parsePairsFromProvisions(provisions);

  const unknownTopics = sortedSetDiff(
    new Set(provisions.flatMap((doc) => doc.topics)),
    new Set(concepts.map((doc) => doc.conceptId))
  );
  if (unknownTopics.length > 0) {
    throw new Error(
      `Unknown concept ids referenced by provisions: ${unknownTopics.join(
        ", "
      )}`
    );
  }

  const missingInProvision = sortedSetDiff(conceptPairs, provisionPairs);
  const missingInConcepts = sortedSetDiff(provisionPairs, conceptPairs);
  if (missingInProvision.length > 0 || missingInConcepts.length > 0) {
    const lines: string[] = [];
    if (missingInProvision.length > 0) {
      lines.push(`Missing in provision docs (${missingInProvision.length}):`);
      for (const pair of missingInProvision) {
        lines.push(`- ${pair}`);
      }
    }
    if (missingInConcepts.length > 0) {
      lines.push(`Missing in concept docs (${missingInConcepts.length}):`);
      for (const pair of missingInConcepts) {
        lines.push(`- ${pair}`);
      }
    }
    throw new Error(lines.join("\n"));
  }

  const provisionAddresses = new Set(provisions.map((doc) => doc.address));
  for (const enforcement of enforcementActions) {
    for (const statutoryReference of enforcement.statutoryReferences) {
      if (!provisionAddresses.has(statutoryReference)) {
        fail(
          enforcement.filePath,
          `statutory reference '${statutoryReference}' does not resolve to a provision markdown file`
        );
      }
    }
  }

  const topicMappingByTopic = new Map<string, Set<string>>();
  for (const concept of concepts) {
    const set = topicMappingByTopic.get(concept.conceptId) ?? new Set<string>();
    for (const reference of concept.references) {
      set.add(reference);
    }
    topicMappingByTopic.set(concept.conceptId, set);
  }

  const isSubtopics: IsSubtopicRow[] = Array.from(subtopicPairs)
    .map((value) => {
      const [subtopic, parentTopic] = value.split("::");
      return { subtopic, parentTopic };
    })
    .sort(
      (a, b) =>
        a.subtopic.localeCompare(b.subtopic) ||
        a.parentTopic.localeCompare(b.parentTopic)
    );

  const topicMappings: TopicMappingRow[] = Array.from(
    topicMappingByTopic.entries()
  )
    .map(([topic, addresses]) => ({
      topic,
      addresses: Array.from(addresses).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.topic.localeCompare(b.topic));

  const statutoryViolations: StatutoryViolationRow[] = enforcementActions
    .flatMap((doc) =>
      doc.statutoryReferences.map((statutoryReference) => ({
        actionReference: doc.referenceId,
        statutoryReference,
      }))
    )
    .sort(
      (a, b) =>
        a.actionReference.localeCompare(b.actionReference) ||
        a.statutoryReference.localeCompare(b.statutoryReference)
    );

  return {
    concepts,
    provisions,
    enforcementActions,
    relations: {
      isSubtopics,
      topicMappings,
      statutoryViolations,
    },
  };
}
