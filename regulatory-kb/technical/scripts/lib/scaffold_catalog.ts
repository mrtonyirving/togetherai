import fg from 'fast-glob';
import fs from 'fs-extra';
import path from 'node:path';

import { repoPath } from './io.js';

function indexConceptsPath(): string {
  return repoPath('library', 'taxonomy', 'index_concepts.md');
}

function indexJurisdictionPath(): string {
  return repoPath('library', 'taxonomy', 'index_jurisdiction.md');
}

function indexEnforcementActionsPath(): string {
  return repoPath('library', 'taxonomy', 'index_enforcement_actions.md');
}

function taxonomyMapRootPath(): string {
  return repoPath('library', 'taxonomy', 'AML', 'map');
}

function conceptsRootPath(): string {
  return repoPath('library', 'taxonomy', 'AML', 'concepts');
}

function enforcementExamplesRootPath(): string {
  return repoPath(
    'library',
    'ontologies',
    'document-types',
    'enforcement-actions',
    'jurisdictions',
    'se',
    'examples',
    'enforcement-actions'
  );
}

export interface LawCatalog {
  name: string;
  lawCodeCandidates: string[];
  chapterNumbers: number[];
  paragraphNumbersByChapter: Record<string, number[]>;
  styckeNumbersByChapterParagraph: Record<string, number[]>;
  punktNumbersByChapterParagraphStycke: Record<string, number[]>;
}

export interface JurisdictionCatalog {
  name: string;
  laws: LawCatalog[];
}

export interface ScaffoldCatalog {
  conceptSlugs: string[];
  enforcementActionSlugs: string[];
  jurisdictions: JurisdictionCatalog[];
}

interface MutableLawCatalog {
  name: string;
  lawCodeCandidates: Set<string>;
  chapterNumbers: Set<number>;
  paragraphNumbersByChapter: Map<string, Set<number>>;
  styckeNumbersByChapterParagraph: Map<string, Set<number>>;
  punktNumbersByChapterParagraphStycke: Map<string, Set<number>>;
}

interface MutableJurisdictionCatalog {
  name: string;
  laws: Map<string, MutableLawCatalog>;
}

const SWEDISH_REFERENCE_PATTERN =
  /SE,RD,(\d{4}:\d+),k(\d+)(?:,p(\d+)(?:,s(\d+)(?:,pt(\d+))?)?)?/g;

function keyForChapter(chapter: number): string {
  return String(chapter);
}

function keyForParagraph(chapter: number, paragraph: number): string {
  return `${chapter}:${paragraph}`;
}

function keyForStycke(chapter: number, paragraph: number, stycke: number): string {
  return `${chapter}:${paragraph}:${stycke}`;
}

function parseKeyTuple(key: string): number[] {
  return key.split(':').map((part) => Number.parseInt(part, 10));
}

function compareNumericTuples(left: string, right: string): number {
  const leftParts = parseKeyTuple(left);
  const rightParts = parseKeyTuple(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }
  return 0;
}

function parseLinkedOrPlainValue(value: string): string {
  const linked = value.match(/^\[([^\]]+)\]\((.+)\)\s*$/);
  if (linked) {
    return linked[1].trim();
  }

  const shorthand = value.match(/^\[([^\]]+)\]\s*$/);
  if (shorthand) {
    return shorthand[1].trim();
  }

  const legacy = value.match(/^([^|]+?)\s*\|\s*File:\s*(.+)$/);
  if (legacy) {
    return legacy[1].trim();
  }

  return value.trim();
}

function parseLevelNumber(nodeName: string): number | undefined {
  const raw = nodeName.trim();
  if (!raw) {
    return undefined;
  }

  const match = raw.match(/(\d+)$/);
  if (!match) {
    return undefined;
  }

  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return undefined;
  }
  return parsed;
}

export function extractLawCodeCandidates(value: string): string[] {
  const matches = value.match(/\d{4}:\d+/g) ?? [];
  return Array.from(new Set(matches));
}

function ensureSet(map: Map<string, Set<number>>, key: string): Set<number> {
  let values = map.get(key);
  if (!values) {
    values = new Set<number>();
    map.set(key, values);
  }
  return values;
}

function ensureJurisdiction(
  target: Map<string, MutableJurisdictionCatalog>,
  name: string
): MutableJurisdictionCatalog {
  const trimmed = name.trim();
  let jurisdiction = target.get(trimmed);
  if (!jurisdiction) {
    jurisdiction = {
      name: trimmed,
      laws: new Map<string, MutableLawCatalog>()
    };
    target.set(trimmed, jurisdiction);
  }
  return jurisdiction;
}

function ensureLaw(jurisdiction: MutableJurisdictionCatalog, name: string): MutableLawCatalog {
  const trimmed = name.trim();
  let law = jurisdiction.laws.get(trimmed);
  if (!law) {
    law = {
      name: trimmed,
      lawCodeCandidates: new Set<string>(),
      chapterNumbers: new Set<number>(),
      paragraphNumbersByChapter: new Map<string, Set<number>>(),
      styckeNumbersByChapterParagraph: new Map<string, Set<number>>(),
      punktNumbersByChapterParagraphStycke: new Map<string, Set<number>>()
    };
    jurisdiction.laws.set(trimmed, law);
  }

  for (const candidate of extractLawCodeCandidates(trimmed)) {
    law.lawCodeCandidates.add(candidate);
  }

  return law;
}

function addChapter(law: MutableLawCatalog, chapter: number): void {
  law.chapterNumbers.add(chapter);
}

function addParagraph(law: MutableLawCatalog, chapter: number, paragraph: number): void {
  addChapter(law, chapter);
  ensureSet(law.paragraphNumbersByChapter, keyForChapter(chapter)).add(paragraph);
}

function addStycke(law: MutableLawCatalog, chapter: number, paragraph: number, stycke: number): void {
  addParagraph(law, chapter, paragraph);
  ensureSet(law.styckeNumbersByChapterParagraph, keyForParagraph(chapter, paragraph)).add(stycke);
}

function addPunkt(
  law: MutableLawCatalog,
  chapter: number,
  paragraph: number,
  stycke: number,
  punkt: number
): void {
  addStycke(law, chapter, paragraph, stycke);
  ensureSet(
    law.punktNumbersByChapterParagraphStycke,
    keyForStycke(chapter, paragraph, stycke)
  ).add(punkt);
}

function sortedStrings(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function sortedNumbers(values: Iterable<number>): number[] {
  return [...values].sort((a, b) => a - b);
}

function sortedNumberRecord(values: Map<string, Set<number>>): Record<string, number[]> {
  const keys = [...values.keys()].sort(compareNumericTuples);
  const output: Record<string, number[]> = {};
  for (const key of keys) {
    output[key] = sortedNumbers(values.get(key) ?? []);
  }
  return output;
}

function toLawCatalog(law: MutableLawCatalog): LawCatalog {
  return {
    name: law.name,
    lawCodeCandidates: sortedStrings(law.lawCodeCandidates),
    chapterNumbers: sortedNumbers(law.chapterNumbers),
    paragraphNumbersByChapter: sortedNumberRecord(law.paragraphNumbersByChapter),
    styckeNumbersByChapterParagraph: sortedNumberRecord(law.styckeNumbersByChapterParagraph),
    punktNumbersByChapterParagraphStycke: sortedNumberRecord(
      law.punktNumbersByChapterParagraphStycke
    )
  };
}

function toJurisdictionCatalog(jurisdiction: MutableJurisdictionCatalog): JurisdictionCatalog {
  return {
    name: jurisdiction.name,
    laws: [...jurisdiction.laws.values()]
      .map((law) => toLawCatalog(law))
      .sort((a, b) => a.name.localeCompare(b.name))
  };
}

async function loadJurisdictionCatalogFromIndex(
  target: Map<string, MutableJurisdictionCatalog>
): Promise<void> {
  const indexPath = indexJurisdictionPath();
  if (!(await fs.pathExists(indexPath))) {
    return;
  }

  const raw = await fs.readFile(indexPath, 'utf8');
  const lines = raw.split(/\r?\n/).map((line) => line.trim());

  let currentJurisdiction: MutableJurisdictionCatalog | undefined;
  let currentLaw: MutableLawCatalog | undefined;
  const levelStack: Array<number | undefined> = [];

  for (const line of lines) {
    if (!line || line.startsWith('#') || line === '---') {
      continue;
    }

    const jurisdictionMatch = line.match(/^\-\s*Jurisdiction:\s*(.+)$/);
    if (jurisdictionMatch) {
      const jurisdictionName = parseLinkedOrPlainValue(jurisdictionMatch[1]);
      currentJurisdiction = ensureJurisdiction(target, jurisdictionName);
      currentLaw = undefined;
      levelStack.length = 0;
      continue;
    }

    const lawMatch = line.match(/^\-\s*Law:\s*(.+)$/);
    if (lawMatch && currentJurisdiction) {
      const lawName = parseLinkedOrPlainValue(lawMatch[1]);
      currentLaw = ensureLaw(currentJurisdiction, lawName);
      levelStack.length = 0;
      continue;
    }

    const levelMatch = line.match(/^\-\s*Level_(\d+):\s*(.+)$/);
    if (!levelMatch || !currentLaw) {
      continue;
    }

    const level = Number.parseInt(levelMatch[1], 10);
    if (!Number.isInteger(level) || level < 1 || level > 4) {
      continue;
    }

    const nodeName = parseLinkedOrPlainValue(levelMatch[2]);
    const number = parseLevelNumber(nodeName);
    if (number === undefined) {
      levelStack[level] = undefined;
      levelStack.length = level + 1;
      continue;
    }

    if (level === 1) {
      addChapter(currentLaw, number);
    } else if (level === 2 && levelStack[1] !== undefined) {
      addParagraph(currentLaw, levelStack[1], number);
    } else if (level === 3 && levelStack[1] !== undefined && levelStack[2] !== undefined) {
      addStycke(currentLaw, levelStack[1], levelStack[2], number);
    } else if (
      level === 4 &&
      levelStack[1] !== undefined &&
      levelStack[2] !== undefined &&
      levelStack[3] !== undefined
    ) {
      addPunkt(currentLaw, levelStack[1], levelStack[2], levelStack[3], number);
    }

    levelStack[level] = number;
    levelStack.length = level + 1;
  }
}

async function loadJurisdictionCatalogFromFilesystem(
  target: Map<string, MutableJurisdictionCatalog>
): Promise<void> {
  const taxonomyMapRoot = taxonomyMapRootPath();
  if (!(await fs.pathExists(taxonomyMapRoot))) {
    return;
  }

  const lawDirectories = await fg('*/legislation/*', {
    cwd: taxonomyMapRoot,
    onlyDirectories: true,
    dot: false
  });

  for (const relativePath of lawDirectories) {
    const [jurisdictionName, marker, lawName] = relativePath.split('/');
    if (!jurisdictionName || marker !== 'legislation' || !lawName) {
      continue;
    }

    const jurisdiction = ensureJurisdiction(target, jurisdictionName);
    ensureLaw(jurisdiction, lawName);
  }

  const markdownFiles = await fg('*/legislation/*/**/*.md', {
    cwd: taxonomyMapRoot,
    onlyFiles: true,
    dot: false
  });

  for (const relativePath of markdownFiles) {
    const segments = relativePath.split('/');
    if (segments.length < 4) {
      continue;
    }

    const jurisdictionName = segments[0];
    const marker = segments[1];
    const lawName = segments[2];
    if (!jurisdictionName || marker !== 'legislation' || !lawName) {
      continue;
    }

    const jurisdiction = ensureJurisdiction(target, jurisdictionName);
    const law = ensureLaw(jurisdiction, lawName);

    let chapter: number | undefined;
    let paragraph: number | undefined;
    let stycke: number | undefined;

    for (let index = 3; index + 1 < segments.length; index += 1) {
      const levelMatch = segments[index].match(/^Level_(\d+)$/);
      if (!levelMatch) {
        continue;
      }

      const level = Number.parseInt(levelMatch[1], 10);
      if (!Number.isInteger(level) || level < 1 || level > 4) {
        continue;
      }

      const nodeName = path.basename(segments[index + 1], '.md');
      const levelNumber = parseLevelNumber(nodeName);
      if (levelNumber === undefined) {
        continue;
      }

      if (level === 1) {
        chapter = levelNumber;
        paragraph = undefined;
        stycke = undefined;
        addChapter(law, levelNumber);
      } else if (level === 2 && chapter !== undefined) {
        paragraph = levelNumber;
        stycke = undefined;
        addParagraph(law, chapter, levelNumber);
      } else if (level === 3 && chapter !== undefined && paragraph !== undefined) {
        stycke = levelNumber;
        addStycke(law, chapter, paragraph, levelNumber);
      } else if (
        level === 4 &&
        chapter !== undefined &&
        paragraph !== undefined &&
        stycke !== undefined
      ) {
        addPunkt(law, chapter, paragraph, stycke, levelNumber);
      }
    }
  }
}

function findOrCreateSwedenLawByCode(
  target: Map<string, MutableJurisdictionCatalog>,
  lawCode: string
): MutableLawCatalog {
  const sweden = ensureJurisdiction(target, 'Sweden');
  for (const law of sweden.laws.values()) {
    if (law.lawCodeCandidates.has(lawCode)) {
      return law;
    }
    if (law.name === lawCode) {
      law.lawCodeCandidates.add(lawCode);
      return law;
    }
  }

  const created = ensureLaw(sweden, lawCode);
  created.lawCodeCandidates.add(lawCode);
  return created;
}

function ingestSwedishReferencesIntoCatalog(
  markdown: string,
  target: Map<string, MutableJurisdictionCatalog>
): void {
  let match = SWEDISH_REFERENCE_PATTERN.exec(markdown);
  while (match) {
    const lawCode = match[1];
    const chapter = Number.parseInt(match[2], 10);
    const paragraph = match[3] ? Number.parseInt(match[3], 10) : undefined;
    const stycke = match[4] ? Number.parseInt(match[4], 10) : undefined;
    const punkt = match[5] ? Number.parseInt(match[5], 10) : undefined;

    const law = findOrCreateSwedenLawByCode(target, lawCode);
    addChapter(law, chapter);
    if (paragraph !== undefined) {
      addParagraph(law, chapter, paragraph);
    }
    if (stycke !== undefined && paragraph !== undefined) {
      addStycke(law, chapter, paragraph, stycke);
    }
    if (punkt !== undefined && paragraph !== undefined && stycke !== undefined) {
      addPunkt(law, chapter, paragraph, stycke, punkt);
    }

    match = SWEDISH_REFERENCE_PATTERN.exec(markdown);
  }

  SWEDISH_REFERENCE_PATTERN.lastIndex = 0;
}

async function loadJurisdictionCatalogFromReferenceMentions(
  target: Map<string, MutableJurisdictionCatalog>
): Promise<void> {
  const files = await fg(
    [
      'library/taxonomy/AML/concepts/**/*.md',
      'library/ontologies/document-types/enforcement-actions/jurisdictions/se/examples/enforcement-actions/*.md'
    ],
    {
      cwd: process.cwd(),
      onlyFiles: true,
      dot: false
    }
  );

  for (const relativePath of files) {
    const absolutePath = path.join(process.cwd(), relativePath);
    const markdown = await fs.readFile(absolutePath, 'utf8');
    ingestSwedishReferencesIntoCatalog(markdown, target);
  }
}

async function loadConceptSlugs(target: Set<string>): Promise<void> {
  const indexConcepts = indexConceptsPath();
  if (await fs.pathExists(indexConcepts)) {
    const raw = await fs.readFile(indexConcepts, 'utf8');
    const lines = raw.split(/\r?\n/).map((line) => line.trim());

    for (const line of lines) {
      if (!line || line.startsWith('#') || line === '---') {
        continue;
      }

      const conceptMatch = line.match(/^\-\s*Concept:\s*(.+)$/);
      if (conceptMatch) {
        target.add(parseLinkedOrPlainValue(conceptMatch[1]));
        continue;
      }

      const subconceptMatch = line.match(/^\-\s*Subconcept:\s*(.+)$/);
      if (subconceptMatch) {
        target.add(parseLinkedOrPlainValue(subconceptMatch[1]));
      }
    }
  }

  const conceptsRoot = conceptsRootPath();
  if (await fs.pathExists(conceptsRoot)) {
    const conceptFiles = await fg('**/*.md', {
      cwd: conceptsRoot,
      onlyFiles: true,
      dot: false
    });

    for (const relativePath of conceptFiles) {
      const slug = path.basename(relativePath, '.md').trim();
      if (slug) {
        target.add(slug);
      }
    }
  }
}

async function loadEnforcementActionSlugs(target: Set<string>): Promise<void> {
  const indexEnforcementActions = indexEnforcementActionsPath();
  if (await fs.pathExists(indexEnforcementActions)) {
    const raw = await fs.readFile(indexEnforcementActions, 'utf8');
    const lines = raw.split(/\r?\n/).map((line) => line.trim());

    for (const line of lines) {
      if (!line || line.startsWith('#') || line === '---') {
        continue;
      }

      const entryMatch = line.match(/^\-\s*Enforcement Action:\s*(.+)$/);
      if (entryMatch) {
        target.add(parseLinkedOrPlainValue(entryMatch[1]));
      }
    }
  }

  const enforcementExamplesRoot = enforcementExamplesRootPath();
  if (await fs.pathExists(enforcementExamplesRoot)) {
    const files = await fg('*.md', {
      cwd: enforcementExamplesRoot,
      onlyFiles: true,
      dot: false
    });

    for (const file of files) {
      const slug = path.basename(file, '.md').trim();
      if (slug) {
        target.add(slug);
      }
    }
  }
}

export function findJurisdictionCatalog(
  catalog: ScaffoldCatalog,
  jurisdictionName: string
): JurisdictionCatalog | undefined {
  const normalized = jurisdictionName.trim().toLowerCase();
  return catalog.jurisdictions.find((entry) => entry.name.toLowerCase() === normalized);
}

export function findLawCatalog(
  jurisdiction: JurisdictionCatalog | undefined,
  lawName: string
): LawCatalog | undefined {
  if (!jurisdiction) {
    return undefined;
  }

  const normalized = lawName.trim().toLowerCase();
  return jurisdiction.laws.find((entry) => entry.name.toLowerCase() === normalized);
}

export function getParagraphNumbers(law: LawCatalog | undefined, chapter: number): number[] {
  if (!law) {
    return [];
  }
  return law.paragraphNumbersByChapter[keyForChapter(chapter)] ?? [];
}

export function getStyckeNumbers(
  law: LawCatalog | undefined,
  chapter: number,
  paragraph: number
): number[] {
  if (!law) {
    return [];
  }
  return law.styckeNumbersByChapterParagraph[keyForParagraph(chapter, paragraph)] ?? [];
}

export function getPunktNumbers(
  law: LawCatalog | undefined,
  chapter: number,
  paragraph: number,
  stycke: number
): number[] {
  if (!law) {
    return [];
  }
  return law.punktNumbersByChapterParagraphStycke[keyForStycke(chapter, paragraph, stycke)] ?? [];
}

export async function loadScaffoldCatalog(): Promise<ScaffoldCatalog> {
  const conceptSlugs = new Set<string>();
  const enforcementActionSlugs = new Set<string>();
  const jurisdictionCatalogs = new Map<string, MutableJurisdictionCatalog>();

  await Promise.all([
    loadConceptSlugs(conceptSlugs),
    loadEnforcementActionSlugs(enforcementActionSlugs),
    loadJurisdictionCatalogFromIndex(jurisdictionCatalogs).then(() =>
      loadJurisdictionCatalogFromFilesystem(jurisdictionCatalogs).then(() =>
        loadJurisdictionCatalogFromReferenceMentions(jurisdictionCatalogs)
      )
    )
  ]);

  return {
    conceptSlugs: sortedStrings(conceptSlugs),
    enforcementActionSlugs: sortedStrings(enforcementActionSlugs),
    jurisdictions: [...jurisdictionCatalogs.values()]
      .map((jurisdiction) => toJurisdictionCatalog(jurisdiction))
      .sort((a, b) => a.name.localeCompare(b.name))
  };
}
