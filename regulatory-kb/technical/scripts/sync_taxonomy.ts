import fs from 'fs-extra';
import path from 'node:path';
import { getRunOptions } from './lib/io.js';

type FileKind = 'index' | 'managed';

interface IndexedLine {
  number: number;
  trimmed: string;
}

interface ConceptEntry {
  name: string;
  file: string;
  subconcepts: SubconceptEntry[];
}

interface SubconceptEntry {
  name: string;
  file: string;
}

interface ProvisionNode {
  level: number;
  name: string;
  children: ProvisionNode[];
}

interface LawEntry {
  name: string;
  provisions: ProvisionNode[];
}

interface JurisdictionEntry {
  name: string;
  laws: LawEntry[];
}

interface ExpectedFile {
  kind: FileKind;
  origin: string;
}

interface ExpectedPaths {
  directories: Map<string, string>;
  files: Map<string, ExpectedFile>;
}

interface ActualPaths {
  directories: Set<string>;
  files: Set<string>;
}

interface DriftReport {
  missingDirectories: string[];
  missingFiles: string[];
  unexpectedDirectories: string[];
  unexpectedFiles: string[];
}

const TAXONOMY_ROOT = path.posix.join('library', 'taxonomy');
const INDEX_CONCEPTS = path.posix.join(TAXONOMY_ROOT, 'index_concepts.md');
const INDEX_JURISDICTION = path.posix.join(TAXONOMY_ROOT, 'index_jurisdiction.md');
const INDEX_ENFORCEMENT_ACTIONS = path.posix.join(TAXONOMY_ROOT, 'index_enforcement_actions.md');
const AML_ROOT = path.posix.join(TAXONOMY_ROOT, 'AML');
const CONCEPTS_ROOT = path.posix.join(AML_ROOT, 'concepts');
const MAP_ROOT = path.posix.join(AML_ROOT, 'map');
const TEMPLATE_ROOT = path.posix.join(AML_ROOT, '_templates');
const GENERATED_ROOT = path.posix.join(TAXONOMY_ROOT, 'generated');

function toAbsolute(relPath: string): string {
  return path.join(process.cwd(), ...relPath.split('/'));
}

function isIgnorableLine(value: string): boolean {
  return value.length === 0 || value.startsWith('#') || value === '---';
}

function readLines(raw: string): IndexedLine[] {
  return raw.split(/\r?\n/).map((line, index) => ({
    number: index + 1,
    trimmed: line.trim()
  }));
}

function ensureValidName(name: string, kind: string, source: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new Error(`${source}: ${kind} must not be empty`);
  }
  if (normalized === '.' || normalized === '..') {
    throw new Error(`${source}: ${kind} cannot be '.' or '..'`);
  }
  if (normalized.includes('/') || normalized.includes('\\')) {
    throw new Error(`${source}: ${kind} cannot contain '/' or '\\'`);
  }
  return normalized;
}

function normalizePosixRelativePath(value: string, kind: string, source: string): string {
  const normalized = value.trim().replace(/\\/g, '/');
  if (!normalized) {
    throw new Error(`${source}: ${kind} must not be empty`);
  }
  if (normalized.startsWith('/') || normalized.includes('..')) {
    throw new Error(`${source}: ${kind} must be a safe relative POSIX path`);
  }
  return normalized;
}

function parseFileReferenceToken(raw: string, kind: string, source: string): string {
  const markdownLink = raw.trim().match(/^\[([^\]]+)\]\((.+)\)$/);
  if (markdownLink) {
    const href = normalizePosixRelativePath(markdownLink[2], kind, source);
    return href;
  }

  return normalizePosixRelativePath(raw, kind, source);
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function parseNameWithOptionalPath(
  raw: string,
  nameKind: string,
  pathKind: string,
  source: string
): { name: string; path?: string } {
  const legacy = raw.match(/^([^|]+?)\s*\|\s*File:\s*(.+)$/);
  if (legacy) {
    return {
      name: ensureValidName(legacy[1], nameKind, source),
      path: parseFileReferenceToken(legacy[2], pathKind, source)
    };
  }

  const linked = raw.match(/^\[([^\]]+)\]\((.+)\)\s*$/);
  if (linked) {
    return {
      name: ensureValidName(linked[1], nameKind, source),
      path: normalizePosixRelativePath(linked[2], pathKind, source)
    };
  }

  const shorthand = raw.match(/^\[([^\]]+)\]\s*$/);
  if (shorthand) {
    return {
      name: ensureValidName(shorthand[1], nameKind, source)
    };
  }

  return {
    name: ensureValidName(raw, nameKind, source)
  };
}

function parseConceptLine(
  line: string,
  source: string
): { name: string; file: string } | null {
  const shorthand = line.match(/^-\s*Concept:\s*\[([^\]]+)\]\s*$/);
  if (shorthand) {
    const name = ensureValidName(shorthand[1], 'concept name', source);
    return {
      name,
      file: path.posix.join('AML', 'concepts', name, `${name}.md`)
    };
  }

  const linked = line.match(/^-\s*Concept:\s*\[([^\]]+)\]\((.+)\)\s*$/);
  if (linked) {
    return {
      name: ensureValidName(linked[1], 'concept name', source),
      file: normalizePosixRelativePath(linked[2], 'concept file path', source)
    };
  }

  const legacy = line.match(/^-\s*Concept:\s*([^|]+?)\s*\|\s*File:\s*(.+)$/);
  if (!legacy) {
    return null;
  }
  return {
    name: ensureValidName(legacy[1], 'concept name', source),
    file: parseFileReferenceToken(legacy[2], 'concept file path', source)
  };
}

function parseSubconceptLine(
  line: string,
  source: string,
  parentConceptName?: string
): { name: string; file: string } | null {
  const shorthand = line.match(/^-\s*Subconcept:\s*\[([^\]]+)\]\s*$/);
  if (shorthand) {
    if (!parentConceptName) {
      throw new Error(`${source}: subconcept shorthand requires a parent concept context`);
    }
    const name = ensureValidName(shorthand[1], 'subconcept name', source);
    return {
      name,
      file: path.posix.join(
        'AML',
        'concepts',
        parentConceptName,
        'subconcepts',
        name,
        `${name}.md`
      )
    };
  }

  const linked = line.match(/^-\s*Subconcept:\s*\[([^\]]+)\]\((.+)\)\s*$/);
  if (linked) {
    return {
      name: ensureValidName(linked[1], 'subconcept name', source),
      file: normalizePosixRelativePath(linked[2], 'subconcept file path', source)
    };
  }

  const legacy = line.match(/^-\s*Subconcept:\s*([^|]+?)\s*\|\s*File:\s*(.+)$/);
  if (!legacy) {
    return null;
  }
  return {
    name: ensureValidName(legacy[1], 'subconcept name', source),
    file: parseFileReferenceToken(legacy[2], 'subconcept file path', source)
  };
}

async function readIndexFile(relPath: string): Promise<IndexedLine[]> {
  const absPath = toAbsolute(relPath);
  if (!(await fs.pathExists(absPath))) {
    throw new Error(`${relPath} is missing`);
  }
  const raw = await fs.readFile(absPath, 'utf8');
  return readLines(raw);
}

function parseConceptIndex(lines: IndexedLine[]): ConceptEntry[] {
  const concepts: ConceptEntry[] = [];
  const conceptNames = new Set<string>();
  const conceptFiles = new Set<string>();
  let currentConcept: ConceptEntry | null = null;

  for (const line of lines) {
    if (isIgnorableLine(line.trimmed)) {
      continue;
    }

    const conceptEntry = parseConceptLine(
      line.trimmed,
      `${INDEX_CONCEPTS}:${line.number}`
    );
    if (conceptEntry) {
      const conceptName = conceptEntry.name;
      if (conceptNames.has(conceptName)) {
        throw new Error(
          `${INDEX_CONCEPTS}:${line.number}: duplicate concept '${conceptName}'`
        );
      }
      if (conceptFiles.has(conceptEntry.file)) {
        throw new Error(
          `${INDEX_CONCEPTS}:${line.number}: duplicate concept file '${conceptEntry.file}'`
        );
      }
      const expectedFile = path.posix.join(
        'AML',
        'concepts',
        conceptName,
        `${conceptName}.md`
      );
      if (conceptEntry.file !== expectedFile) {
        throw new Error(
          `${INDEX_CONCEPTS}:${line.number}: concept '${conceptName}' must reference file '${expectedFile}'`
        );
      }
      const concept: ConceptEntry = {
        name: conceptName,
        file: conceptEntry.file,
        subconcepts: []
      };
      concepts.push(concept);
      conceptNames.add(conceptName);
      conceptFiles.add(conceptEntry.file);
      currentConcept = concept;
      continue;
    }

    const subconceptEntry = parseSubconceptLine(
      line.trimmed,
      `${INDEX_CONCEPTS}:${line.number}`,
      currentConcept?.name
    );
    if (subconceptEntry) {
      if (!currentConcept) {
        throw new Error(
          `${INDEX_CONCEPTS}:${line.number}: subconcept appears before any concept`
        );
      }
      const subconceptName = subconceptEntry.name;
      if (currentConcept.subconcepts.some((entry) => entry.name === subconceptName)) {
        throw new Error(
          `${INDEX_CONCEPTS}:${line.number}: duplicate subconcept '${subconceptName}' under concept '${currentConcept.name}'`
        );
      }
      const expectedFile = path.posix.join(
        'AML',
        'concepts',
        currentConcept.name,
        'subconcepts',
        subconceptName,
        `${subconceptName}.md`
      );
      if (subconceptEntry.file !== expectedFile) {
        throw new Error(
          `${INDEX_CONCEPTS}:${line.number}: subconcept '${subconceptName}' under concept '${currentConcept.name}' must reference file '${expectedFile}'`
        );
      }
      currentConcept.subconcepts.push({
        name: subconceptName,
        file: subconceptEntry.file
      });
      continue;
    }

    throw new Error(
      `${INDEX_CONCEPTS}:${line.number}: unsupported syntax '${line.trimmed}'`
    );
  }

  if (concepts.length === 0) {
    throw new Error(`${INDEX_CONCEPTS}: at least one concept is required`);
  }

  return concepts;
}

function parseJurisdictionIndex(lines: IndexedLine[]): JurisdictionEntry[] {
  const jurisdictions: JurisdictionEntry[] = [];
  const jurisdictionNames = new Set<string>();
  let currentJurisdiction: JurisdictionEntry | null = null;
  let currentLaw: LawEntry | null = null;
  let currentLawDirectory: string | null = null;
  let levelStack: Array<ProvisionNode | undefined> = [];
  let levelDirectoryStack: Array<string | undefined> = [];

  for (const line of lines) {
    if (isIgnorableLine(line.trimmed)) {
      continue;
    }
    const source = `${INDEX_JURISDICTION}:${line.number}`;

    const jurisdictionMatch = line.trimmed.match(/^-\s*Jurisdiction:\s*(.+)$/);
    if (jurisdictionMatch) {
      const parsed = parseNameWithOptionalPath(
        jurisdictionMatch[1],
        'jurisdiction name',
        'jurisdiction file path',
        source
      );
      const jurisdictionName = parsed.name;
      const expectedJurisdictionFile = path.posix.join(
        'AML',
        'map',
        jurisdictionName,
        `${jurisdictionName}.md`
      );
      const jurisdictionFile = parsed.path ?? expectedJurisdictionFile;
      if (jurisdictionFile !== expectedJurisdictionFile) {
        throw new Error(
          `${source}: jurisdiction '${jurisdictionName}' must reference file '${expectedJurisdictionFile}'`
        );
      }
      if (jurisdictionNames.has(jurisdictionName)) {
        throw new Error(
          `${INDEX_JURISDICTION}:${line.number}: duplicate jurisdiction '${jurisdictionName}'`
        );
      }
      const jurisdiction: JurisdictionEntry = { name: jurisdictionName, laws: [] };
      jurisdictions.push(jurisdiction);
      jurisdictionNames.add(jurisdictionName);
      currentJurisdiction = jurisdiction;
      currentLaw = null;
      currentLawDirectory = null;
      levelStack = [];
      levelDirectoryStack = [];
      continue;
    }

    const lawMatch = line.trimmed.match(/^-\s*Law:\s*(.+)$/);
    if (lawMatch) {
      if (!currentJurisdiction) {
        throw new Error(
          `${INDEX_JURISDICTION}:${line.number}: law appears before any jurisdiction`
        );
      }
      const parsed = parseNameWithOptionalPath(
        lawMatch[1],
        'law name',
        'law directory path',
        source
      );
      const lawName = parsed.name;
      const expectedLawDirectory = path.posix.join(
        'AML',
        'map',
        currentJurisdiction.name,
        'legislation',
        lawName
      );
      const lawDirectory = parsed.path
        ? stripTrailingSlashes(parsed.path)
        : expectedLawDirectory;
      if (lawDirectory !== expectedLawDirectory) {
        throw new Error(
          `${source}: law '${lawName}' under jurisdiction '${currentJurisdiction.name}' must reference '${expectedLawDirectory}'`
        );
      }
      if (currentJurisdiction.laws.some((law) => law.name === lawName)) {
        throw new Error(
          `${INDEX_JURISDICTION}:${line.number}: duplicate law '${lawName}' under jurisdiction '${currentJurisdiction.name}'`
        );
      }
      const law: LawEntry = { name: lawName, provisions: [] };
      currentJurisdiction.laws.push(law);
      currentLaw = law;
      currentLawDirectory = lawDirectory;
      levelStack = [];
      levelDirectoryStack = [];
      continue;
    }

    const levelMatch = line.trimmed.match(/^-\s*Level_(\d+):\s*(.+)$/);
    if (levelMatch) {
      if (!currentLaw || !currentLawDirectory) {
        throw new Error(
          `${INDEX_JURISDICTION}:${line.number}: Level_N appears before any law`
        );
      }

      const level = Number.parseInt(levelMatch[1], 10);
      if (!Number.isInteger(level) || level < 1) {
        throw new Error(
          `${INDEX_JURISDICTION}:${line.number}: invalid level '${levelMatch[1]}'`
        );
      }

      const parsed = parseNameWithOptionalPath(
        levelMatch[2],
        'provision name',
        'provision file path',
        source
      );
      const provisionName = parsed.name;

      const parentDirectory =
        level === 1 ? currentLawDirectory : levelDirectoryStack[level - 1];
      if (!parentDirectory) {
        throw new Error(
          `${INDEX_JURISDICTION}:${line.number}: Level_${level} provision '${provisionName}' is missing parent Level_${level - 1}`
        );
      }

      const expectedProvisionDirectory = path.posix.join(
        parentDirectory,
        `Level_${level}`,
        provisionName
      );
      const expectedProvisionFile = path.posix.join(
        expectedProvisionDirectory,
        `${provisionName}.md`
      );
      const provisionFile = parsed.path ?? expectedProvisionFile;
      if (provisionFile !== expectedProvisionFile) {
        throw new Error(
          `${source}: Level_${level} provision '${provisionName}' must reference file '${expectedProvisionFile}'`
        );
      }

      const node: ProvisionNode = { level, name: provisionName, children: [] };

      if (level === 1) {
        if (currentLaw.provisions.some((item) => item.name === provisionName)) {
          throw new Error(
            `${INDEX_JURISDICTION}:${line.number}: duplicate Level_1 provision '${provisionName}' under law '${currentLaw.name}'`
          );
        }
        currentLaw.provisions.push(node);
      } else {
        const parent = levelStack[level - 1];
        if (!parent) {
          throw new Error(
            `${INDEX_JURISDICTION}:${line.number}: Level_${level} provision '${provisionName}' is missing parent Level_${level - 1}`
          );
        }
        if (parent.children.some((item) => item.name === provisionName)) {
          throw new Error(
            `${INDEX_JURISDICTION}:${line.number}: duplicate Level_${level} provision '${provisionName}' under '${parent.name}'`
          );
        }
        parent.children.push(node);
      }

      levelStack[level] = node;
      levelStack.length = level + 1;
      levelDirectoryStack[level] = expectedProvisionDirectory;
      levelDirectoryStack.length = level + 1;
      continue;
    }

    throw new Error(
      `${INDEX_JURISDICTION}:${line.number}: unsupported syntax '${line.trimmed}'`
    );
  }

  if (jurisdictions.length === 0) {
    throw new Error(`${INDEX_JURISDICTION}: at least one jurisdiction is required`);
  }

  for (const jurisdiction of jurisdictions) {
    if (jurisdiction.laws.length === 0) {
      throw new Error(
        `${INDEX_JURISDICTION}: jurisdiction '${jurisdiction.name}' must contain at least one law`
      );
    }
  }

  return jurisdictions;
}

function addExpectedDirectory(
  expected: ExpectedPaths,
  relPath: string,
  origin: string
): void {
  const existingFile = expected.files.get(relPath);
  if (existingFile) {
    throw new Error(
      `Path collision at '${relPath}' between directory (${origin}) and file (${existingFile.origin})`
    );
  }

  if (!expected.directories.has(relPath)) {
    expected.directories.set(relPath, origin);
  }
}

function addExpectedFile(
  expected: ExpectedPaths,
  relPath: string,
  kind: FileKind,
  origin: string
): void {
  const existingDir = expected.directories.get(relPath);
  if (existingDir) {
    throw new Error(
      `Path collision at '${relPath}' between file (${origin}) and directory (${existingDir})`
    );
  }

  const existingFile = expected.files.get(relPath);
  if (!existingFile) {
    expected.files.set(relPath, { kind, origin });
    return;
  }

  if (existingFile.kind !== kind) {
    throw new Error(
      `Path collision at '${relPath}' with conflicting file kinds (${existingFile.kind} vs ${kind})`
    );
  }
}

function addProvisionNode(
  expected: ExpectedPaths,
  parentRelPath: string,
  node: ProvisionNode,
  origin: string
): void {
  const levelDir = path.posix.join(parentRelPath, `Level_${node.level}`);
  const nodeDir = path.posix.join(levelDir, node.name);
  const nodeFile = path.posix.join(nodeDir, `${node.name}.md`);

  addExpectedDirectory(expected, levelDir, origin);
  addExpectedDirectory(expected, nodeDir, origin);
  addExpectedFile(expected, nodeFile, 'managed', origin);

  for (const child of node.children) {
    addProvisionNode(expected, nodeDir, child, origin);
  }
}

function buildExpectedPaths(
  concepts: ConceptEntry[],
  jurisdictions: JurisdictionEntry[]
): ExpectedPaths {
  const expected: ExpectedPaths = {
    directories: new Map<string, string>(),
    files: new Map<string, ExpectedFile>()
  };

  addExpectedDirectory(expected, TAXONOMY_ROOT, 'taxonomy root');
  addExpectedDirectory(expected, AML_ROOT, 'AML root');
  addExpectedDirectory(expected, CONCEPTS_ROOT, 'concepts root');
  addExpectedDirectory(expected, MAP_ROOT, 'map root');
  addExpectedDirectory(expected, TEMPLATE_ROOT, 'template root');
  addExpectedDirectory(expected, GENERATED_ROOT, 'generated root');
  addExpectedFile(expected, INDEX_CONCEPTS, 'index', 'concept index');
  addExpectedFile(expected, INDEX_JURISDICTION, 'index', 'jurisdiction index');
  addExpectedFile(
    expected,
    INDEX_ENFORCEMENT_ACTIONS,
    'index',
    'enforcement action index'
  );
  addExpectedFile(
    expected,
    path.posix.join(TEMPLATE_ROOT, 'concept_template.md'),
    'managed',
    'concept template'
  );
  addExpectedFile(
    expected,
    path.posix.join(TEMPLATE_ROOT, 'provision_template.md'),
    'managed',
    'provision template'
  );
  addExpectedFile(
    expected,
    path.posix.join(TEMPLATE_ROOT, 'enforcement_action_template.md'),
    'managed',
    'enforcement action template'
  );

  for (const concept of concepts) {
    const conceptFile = path.posix.join(TAXONOMY_ROOT, concept.file);
    const conceptDir = path.posix.dirname(conceptFile);
    addExpectedDirectory(expected, conceptDir, `concept '${concept.name}'`);
    addExpectedFile(expected, conceptFile, 'managed', `concept '${concept.name}'`);

    if (concept.subconcepts.length > 0) {
      const subconceptsRoot = path.posix.join(conceptDir, 'subconcepts');
      addExpectedDirectory(
        expected,
        subconceptsRoot,
        `subconcept root for '${concept.name}'`
      );

      for (const subconcept of concept.subconcepts) {
        const subconceptFile = path.posix.join(TAXONOMY_ROOT, subconcept.file);
        const subconceptDir = path.posix.dirname(subconceptFile);
        addExpectedDirectory(
          expected,
          subconceptDir,
          `subconcept '${subconcept.name}'`
        );
        addExpectedFile(
          expected,
          subconceptFile,
          'managed',
          `subconcept '${subconcept.name}'`
        );
      }
    }
  }

  for (const jurisdiction of jurisdictions) {
    const jurisdictionDir = path.posix.join(MAP_ROOT, jurisdiction.name);
    const jurisdictionFile = path.posix.join(jurisdictionDir, `${jurisdiction.name}.md`);
    const legislationDir = path.posix.join(jurisdictionDir, 'legislation');

    addExpectedDirectory(
      expected,
      jurisdictionDir,
      `jurisdiction '${jurisdiction.name}'`
    );
    addExpectedFile(
      expected,
      jurisdictionFile,
      'managed',
      `jurisdiction '${jurisdiction.name}'`
    );
    addExpectedDirectory(
      expected,
      legislationDir,
      `legislation root for '${jurisdiction.name}'`
    );

    for (const law of jurisdiction.laws) {
      const lawDir = path.posix.join(legislationDir, law.name);
      const lawOrigin = `law '${law.name}' in jurisdiction '${jurisdiction.name}'`;
      addExpectedDirectory(expected, lawDir, lawOrigin);

      for (const provision of law.provisions) {
        addProvisionNode(expected, lawDir, provision, lawOrigin);
      }
    }
  }

  return expected;
}

async function collectActualPaths(rootRelPath: string): Promise<ActualPaths> {
  const directories = new Set<string>();
  const files = new Set<string>();

  async function walk(relPath: string): Promise<void> {
    const absolutePath = toAbsolute(relPath);
    const stats = await fs.lstat(absolutePath);

    if (stats.isSymbolicLink()) {
      throw new Error(`${relPath} cannot be a symbolic link`);
    }

    if (stats.isDirectory()) {
      directories.add(relPath);
      const entries = await fs.readdir(absolutePath);
      entries.sort((a, b) => a.localeCompare(b));
      for (const entry of entries) {
        await walk(path.posix.join(relPath, entry));
      }
      return;
    }

    if (stats.isFile()) {
      files.add(relPath);
      return;
    }

    throw new Error(`${relPath} has unsupported file type`);
  }

  if (!(await fs.pathExists(toAbsolute(rootRelPath)))) {
    return { directories, files };
  }

  await walk(rootRelPath);
  return { directories, files };
}

function sorted(values: Iterable<string>): string[] {
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

async function computeDrift(expected: ExpectedPaths): Promise<DriftReport> {
  const actual = await collectActualPaths(TAXONOMY_ROOT);

  const missingDirectories = sorted(
    Array.from(expected.directories.keys()).filter(
      (relPath) => !actual.directories.has(relPath)
    )
  );

  const missingFiles = sorted(
    Array.from(expected.files.keys()).filter((relPath) => !actual.files.has(relPath))
  );

  const unexpectedDirectories = sorted(
    Array.from(actual.directories).filter(
      (relPath) => !expected.directories.has(relPath) && !relPath.startsWith(`${GENERATED_ROOT}/`)
    )
  );

  const unexpectedFiles = sorted(
    Array.from(actual.files).filter(
      (relPath) => !expected.files.has(relPath) && !relPath.startsWith(`${GENERATED_ROOT}/`)
    )
  );

  return {
    missingDirectories,
    missingFiles,
    unexpectedDirectories,
    unexpectedFiles
  };
}

function hasDrift(report: DriftReport): boolean {
  return (
    report.missingDirectories.length > 0 ||
    report.missingFiles.length > 0 ||
    report.unexpectedDirectories.length > 0 ||
    report.unexpectedFiles.length > 0
  );
}

function printCategory(label: string, values: string[]): void {
  if (values.length === 0) {
    return;
  }

  console.error(`${label} (${values.length}):`);
  for (const value of values) {
    console.error(`- ${value}`);
  }
}

function countMissingGeneratedFiles(
  expected: ExpectedPaths,
  missingFiles: string[]
): number {
  return missingFiles.filter((relPath) => {
    const metadata = expected.files.get(relPath);
    return metadata?.kind === 'managed';
  }).length;
}

async function applySync(expected: ExpectedPaths, drift: DriftReport): Promise<void> {
  const missingDirectories = [...drift.missingDirectories].sort(
    (a, b) => a.length - b.length || a.localeCompare(b)
  );
  for (const relPath of missingDirectories) {
    await fs.ensureDir(toAbsolute(relPath));
  }

  for (const relPath of drift.missingFiles) {
    const metadata = expected.files.get(relPath);
    if (!metadata || metadata.kind !== 'managed') {
      continue;
    }
    await fs.ensureDir(path.dirname(toAbsolute(relPath)));
    await fs.writeFile(toAbsolute(relPath), '', 'utf8');
  }

  const unexpectedFiles = [...drift.unexpectedFiles].sort(
    (a, b) => b.length - a.length || b.localeCompare(a)
  );
  for (const relPath of unexpectedFiles) {
    await fs.remove(toAbsolute(relPath));
  }

  const unexpectedDirectories = [...drift.unexpectedDirectories].sort(
    (a, b) => b.length - a.length || b.localeCompare(a)
  );
  for (const relPath of unexpectedDirectories) {
    await fs.remove(toAbsolute(relPath));
  }
}

async function main(): Promise<void> {
  const options = getRunOptions(process.argv.slice(2));
  const conceptLines = await readIndexFile(INDEX_CONCEPTS);
  const jurisdictionLines = await readIndexFile(INDEX_JURISDICTION);
  const concepts = parseConceptIndex(conceptLines);
  const jurisdictions = parseJurisdictionIndex(jurisdictionLines);
  const expected = buildExpectedPaths(concepts, jurisdictions);
  const initialDrift = await computeDrift(expected);

  if (options.check) {
    if (hasDrift(initialDrift)) {
      console.error('taxonomy check failed.');
      printCategory('Missing directories', initialDrift.missingDirectories);
      printCategory('Missing files', initialDrift.missingFiles);
      printCategory('Unexpected directories', initialDrift.unexpectedDirectories);
      printCategory('Unexpected files', initialDrift.unexpectedFiles);
      process.exit(1);
    }

    console.log('taxonomy check passed.');
    return;
  }

  await applySync(expected, initialDrift);

  const finalDrift = await computeDrift(expected);
  if (hasDrift(finalDrift)) {
    throw new Error('taxonomy sync completed with unresolved drift');
  }

  const createdGeneratedFiles = countMissingGeneratedFiles(
    expected,
    initialDrift.missingFiles
  );
  const removedPaths =
    initialDrift.unexpectedDirectories.length + initialDrift.unexpectedFiles.length;

  const changed =
    initialDrift.missingDirectories.length +
    createdGeneratedFiles +
    removedPaths;

  if (changed === 0) {
    console.log('taxonomy sync: no changes');
    return;
  }

  console.log(
    `taxonomy sync: updated directories=${initialDrift.missingDirectories.length} created_files=${createdGeneratedFiles} removed_paths=${removedPaths}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
