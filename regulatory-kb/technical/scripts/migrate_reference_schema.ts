import fs from 'fs-extra';

import {
  canonicalizeReferenceAddress,
  formatReferenceBlocksFromAddresses,
  formatReferenceMetadataLines,
  parseCanonicalReference,
  referenceMetadataFromCanonicalAddress,
  validateReferenceMetadataBlock
} from './lib/reference_contract.js';
import {
  extractMarkdownSections,
  globMarkdown,
  parseKeyValueBullets,
  parseSubsectionBlocks
} from './lib/structured_markdown.js';
import { toPosixRelative } from './lib/io.js';

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function parsePositiveIntWithPrefixes(value: string, prefixes: string[]): number {
  let normalized = value.trim().toLowerCase();
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }

  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Expected positive integer value, received '${value}'`);
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected positive integer value, received '${value}'`);
  }
  return parsed;
}

function normalizeArticleHeadingSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) {
    throw new Error(`Invalid article heading '${value}'`);
  }
  return slug;
}

function normalizeToken(value: string, prefixes: string[]): string {
  let normalized = value.trim().toLowerCase();
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }

  normalized = normalized
    .replace(/^\(+/, '')
    .replace(/\)+$/, '')
    .replace(/[.)]+$/, '')
    .trim();

  if (!/^[a-z0-9]+$/.test(normalized)) {
    throw new Error(`Invalid token '${value}'`);
  }

  return normalized;
}

function buildCanonicalFromLegacyStructuredBlock(block: {
  jurisdiction: 'SE' | 'EU';
  fields: Record<string, string>;
}): string {
  if (block.jurisdiction === 'SE') {
    const law = block.fields.law;
    if (!law) {
      throw new Error("Sweden block is missing required field 'Law'");
    }

    const chapterRaw = block.fields.kapitel ?? block.fields.chapter;
    if (!chapterRaw) {
      throw new Error("Sweden block is missing required field 'Kapitel/Chapter'");
    }
    const chapter = parsePositiveIntWithPrefixes(chapterRaw, ['k']);

    const paragraphRaw = block.fields.paragraph ?? block.fields.paragraf;
    const paragraph = paragraphRaw
      ? parsePositiveIntWithPrefixes(paragraphRaw, ['p'])
      : undefined;
    const stycke = block.fields.stycke
      ? parsePositiveIntWithPrefixes(block.fields.stycke, ['s'])
      : undefined;
    const punkt = block.fields.punkt
      ? parsePositiveIntWithPrefixes(block.fields.punkt, ['pt'])
      : undefined;

    if (stycke !== undefined && paragraph === undefined) {
      throw new Error('Sweden block: Stycke requires Paragraph');
    }
    if (punkt !== undefined && stycke === undefined) {
      throw new Error('Sweden block: Punkt requires Stycke');
    }

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

    return canonicalizeReferenceAddress(parts.join(','), 'legacy Sweden concept block');
  }

  const citation = block.fields.citation ?? block.fields.law;
  if (!citation) {
    throw new Error("EU block is missing required field 'Citation/Law'");
  }

  const recitalsRaw = block.fields.recitals ?? block.fields.recital;
  const chapterRaw = block.fields.chapter;
  const sectionRaw = block.fields.section;
  const articleRaw = block.fields.article;
  const articleHeadingRaw = block.fields.article_heading;
  const paragraphRaw = block.fields.paragraph;
  const subparagraphRaw = block.fields.subparagraph;
  const pointRaw = block.fields.point;
  const indentRaw = block.fields.indent;

  const parts = ['EU', 'RD', citation];

  if (recitalsRaw) {
    const range = recitalsRaw.trim().toLowerCase().replace(/^r/, '');
    if (!/^\d+(?:-\d+)?$/.test(range)) {
      throw new Error(`Invalid EU recitals value '${recitalsRaw}'`);
    }
    parts.push(`r${range}`);
  }

  if (chapterRaw) {
    parts.push(`ch${parsePositiveIntWithPrefixes(chapterRaw, ['ch'])}`);
  }
  if (sectionRaw) {
    parts.push(`sec${parsePositiveIntWithPrefixes(sectionRaw, ['sec'])}`);
  }
  if (articleRaw) {
    parts.push(`art${parsePositiveIntWithPrefixes(articleRaw, ['art'])}`);
  }
  if (articleHeadingRaw) {
    parts.push(`ah${normalizeArticleHeadingSlug(articleHeadingRaw)}`);
  }
  if (paragraphRaw) {
    parts.push(`par${parsePositiveIntWithPrefixes(paragraphRaw, ['par', 'p'])}`);
  }
  if (subparagraphRaw) {
    parts.push(`sub${parsePositiveIntWithPrefixes(subparagraphRaw, ['sub', 'sp'])}`);
  }
  if (pointRaw) {
    parts.push(`pt${normalizeToken(pointRaw, ['pt'])}`);
  }
  if (indentRaw) {
    parts.push(`ind${normalizeToken(indentRaw, ['ind'])}`);
  }

  return canonicalizeReferenceAddress(parts.join(','), 'legacy EU concept block');
}

function extractLegacyConceptAddresses(sectionBody: string): string[] {
  const lines = sectionBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const canonicalBullets = lines
    .map((line) => line.match(/^\-\s*((?:SE|EU),RD,.+)$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => canonicalizeReferenceAddress(match[1], 'legacy canonical concept bullet'));
  if (canonicalBullets.length === lines.length) {
    return canonicalBullets;
  }

  const addresses: string[] = [];
  let current: { jurisdiction: 'SE' | 'EU'; fields: Record<string, string> } | null = null;

  const flush = (): void => {
    if (!current) {
      return;
    }
    addresses.push(buildCanonicalFromLegacyStructuredBlock(current));
    current = null;
  };

  for (const line of lines) {
    const header = line.match(/^(?:-\s*)?(Sweden|EU)\s*:\s*$/i);
    if (header) {
      flush();
      current = {
        jurisdiction: header[1].toLowerCase() === 'sweden' ? 'SE' : 'EU',
        fields: {}
      };
      continue;
    }

    if (!current) {
      throw new Error(
        "references section must use '### ref_N' blocks after migration; unsupported legacy format encountered"
      );
    }

    const field = line.match(/^(?:-\s*)?([^:]+)\s*:\s*(.+)$/);
    if (!field) {
      throw new Error(`Invalid legacy structured reference line '${line}'`);
    }

    const key = normalizeKey(field[1]);
    const value = field[2].trim();
    if (!value) {
      throw new Error(`Legacy structured reference field '${key}' cannot be empty`);
    }
    current.fields[key] = value;
  }

  flush();
  return addresses;
}

function parseStrictReferenceBlocks(sectionBody: string): string[] {
  const blocks = parseSubsectionBlocks(sectionBody, '/tmp/migration.md', 'references');
  const addresses: string[] = [];

  for (const [name, blockBody] of Object.entries(blocks)) {
    const fields = parseKeyValueBullets(
      blockBody,
      '/tmp/migration.md',
      `references.${name}`
    );
    const normalized = validateReferenceMetadataBlock(fields, `references.${name}`);
    addresses.push(normalized.address);
  }

  return addresses;
}

function renderProvisionMetadataSection(metadata: Record<string, string>): string[] {
  return formatReferenceMetadataLines(metadata);
}

function replaceSection(
  markdown: string,
  sectionName: string,
  replacementBodyLines: string[]
): string {
  const lines = markdown.split(/\r?\n/);
  const normalizedSection = sectionName.trim().toLowerCase();

  const headingIndex = lines.findIndex(
    (line) => line.trim().toLowerCase() === `## ${normalizedSection}`
  );
  if (headingIndex === -1) {
    return markdown;
  }

  let endIndex = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index].trim())) {
      endIndex = index;
      break;
    }
  }

  const next = [
    ...lines.slice(0, headingIndex + 1),
    '',
    ...replacementBodyLines,
    ...lines.slice(endIndex)
  ];

  return `${next.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

async function migrateConceptFiles(): Promise<number> {
  const files = await globMarkdown(['library/taxonomy/AML/concepts/**/*.md']);
  let changed = 0;

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, 'utf8');
    const sections = extractMarkdownSections(raw);
    if (sections.references === undefined) {
      continue;
    }

    let addresses: string[] = [];
    const body = sections.references.trim();
    if (body.length > 0) {
      if (body.includes('### ')) {
        try {
          addresses = parseStrictReferenceBlocks(body);
        } catch {
          addresses = extractLegacyConceptAddresses(body);
        }
      } else {
        addresses = extractLegacyConceptAddresses(body);
      }
    }

    const replacement = formatReferenceBlocksFromAddresses(addresses);
    const next = replaceSection(raw, 'references', replacement);
    if (next !== raw) {
      await fs.writeFile(filePath, next, 'utf8');
      changed += 1;
      console.log(`Migrated ${toPosixRelative(filePath)}`);
    }
  }

  return changed;
}

function extractAddressesFromEnforcementSection(sectionBody: string): string[] {
  const trimmed = sectionBody.trim();
  if (!trimmed) {
    return [];
  }

  const blocks = parseSubsectionBlocks(
    sectionBody,
    '/tmp/migration.md',
    'statutory_references'
  );
  const addresses: string[] = [];

  for (const [name, blockBody] of Object.entries(blocks)) {
    const fields = parseKeyValueBullets(
      blockBody,
      '/tmp/migration.md',
      `statutory_references.${name}`
    );

    if (fields.jurisdiction && fields.entity && fields.level && fields.level_label) {
      const normalized = validateReferenceMetadataBlock(
        fields,
        `statutory_references.${name}`
      );
      addresses.push(normalized.address);
      continue;
    }

    const address = fields.address;
    if (!address) {
      throw new Error(
        `statutory_references.${name} is missing address and cannot be migrated`
      );
    }
    addresses.push(canonicalizeReferenceAddress(address, `statutory_references.${name}.address`));
  }

  return addresses;
}

async function migrateEnforcementFiles(): Promise<number> {
  const files = await globMarkdown([
    'library/ontologies/document-types/enforcement-actions/jurisdictions/se/examples/enforcement-actions/*.md'
  ]);
  let changed = 0;

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, 'utf8');
    const sections = extractMarkdownSections(raw);
    if (sections.statutory_references === undefined) {
      continue;
    }

    const addresses = extractAddressesFromEnforcementSection(
      sections.statutory_references
    );
    const replacement = formatReferenceBlocksFromAddresses(addresses);
    const next = replaceSection(raw, 'statutory_references', replacement);
    if (next !== raw) {
      await fs.writeFile(filePath, next, 'utf8');
      changed += 1;
      console.log(`Migrated ${toPosixRelative(filePath)}`);
    }
  }

  return changed;
}

async function migrateProvisionFiles(): Promise<number> {
  const files = await globMarkdown([
    'library/taxonomy/AML/map/Sweden/legislation/**/*.md',
    'library/taxonomy/AML/map/EU/legislation/**/*.md'
  ]);
  let changed = 0;

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, 'utf8');
    if (!raw.trim()) {
      continue;
    }

    const sections = extractMarkdownSections(raw);
    if (sections.metadata === undefined) {
      continue;
    }

    const metadata = parseKeyValueBullets(sections.metadata, filePath, 'metadata');
    const normalized = validateReferenceMetadataBlock(metadata, 'metadata');
    const replacement = renderProvisionMetadataSection(normalized);
    const next = replaceSection(raw, 'metadata', replacement);
    if (next !== raw) {
      await fs.writeFile(filePath, next, 'utf8');
      changed += 1;
      console.log(`Migrated ${toPosixRelative(filePath)}`);
    }
  }

  return changed;
}

async function main(): Promise<void> {
  let changed = 0;
  changed += await migrateConceptFiles();
  changed += await migrateEnforcementFiles();
  changed += await migrateProvisionFiles();

  if (changed === 0) {
    console.log('migrate_reference_schema.ts: no changes');
    return;
  }

  console.log(`migrate_reference_schema.ts: updated ${changed} file(s)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
