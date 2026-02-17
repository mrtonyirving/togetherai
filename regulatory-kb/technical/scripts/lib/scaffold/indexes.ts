import fs from 'fs-extra';
import path from 'node:path';

import {
  conceptFileRef,
  enforcementActionFileRef,
  indexConceptsPath,
  indexEnforcementActionsPath,
  indexJurisdictionPath,
  jurisdictionFileRef,
  lawDirectoryRef,
  subconceptFileRef
} from './paths.js';
import type {
  ConceptEntry,
  EnforcementActionEntry,
  JurisdictionEntry,
  ProvisionNode
} from './types.js';

function parseFileRefToken(value: string): string {
  const markdownLink = value.match(/^\[([^\]]+)\]\((.+)\)$/);
  if (markdownLink) {
    const label = markdownLink[1].trim().replace(/\\/g, '/');
    const href = markdownLink[2].trim().replace(/\\/g, '/');
    if (label !== href) {
      throw new Error(`Concept index file reference label must match href: '${value}'`);
    }
    return href;
  }
  return value.replace(/\\/g, '/');
}

function parseConceptIndexLine(line: string): { name: string; file: string } | null {
  const shorthand = line.match(/^-\s*Concept:\s*\[([^\]]+)\]\s*$/);
  if (shorthand) {
    const name = shorthand[1].trim();
    return {
      name,
      file: conceptFileRef(name)
    };
  }

  const linked = line.match(/^-\s*Concept:\s*\[([^\]]+)\]\((.+)\)\s*$/);
  if (linked) {
    return {
      name: linked[1].trim(),
      file: linked[2].trim().replace(/\\/g, '/')
    };
  }

  const legacy = line.match(/^-\s*Concept:\s*([^|]+?)\s*\|\s*File:\s*(.+)$/);
  if (!legacy) {
    return null;
  }

  return {
    name: legacy[1].trim(),
    file: parseFileRefToken(legacy[2].trim())
  };
}

function parseSubconceptIndexLine(
  line: string,
  parentConceptName?: string
): { name: string; file: string } | null {
  const shorthand = line.match(/^-\s*Subconcept:\s*\[([^\]]+)\]\s*$/);
  if (shorthand) {
    const name = shorthand[1].trim();
    if (!parentConceptName) {
      throw new Error(`Subconcept shorthand requires parent concept context: '${line}'`);
    }

    return {
      name,
      file: subconceptFileRef(parentConceptName, name)
    };
  }

  const linked = line.match(/^-\s*Subconcept:\s*\[([^\]]+)\]\((.+)\)\s*$/);
  if (linked) {
    return {
      name: linked[1].trim(),
      file: linked[2].trim().replace(/\\/g, '/')
    };
  }

  const legacy = line.match(/^-\s*Subconcept:\s*([^|]+?)\s*\|\s*File:\s*(.+)$/);
  if (!legacy) {
    return null;
  }

  return {
    name: legacy[1].trim(),
    file: parseFileRefToken(legacy[2].trim())
  };
}

function parseLinkedOrPlainValue(value: string): {
  name: string;
  path?: string;
} {
  const linked = value.match(/^\[([^\]]+)\]\((.+)\)\s*$/);
  if (linked) {
    return {
      name: linked[1].trim(),
      path: linked[2].trim().replace(/\\/g, '/')
    };
  }

  const shorthand = value.match(/^\[([^\]]+)\]\s*$/);
  if (shorthand) {
    return { name: shorthand[1].trim() };
  }

  const legacy = value.match(/^([^|]+?)\s*\|\s*File:\s*(.+)$/);
  if (legacy) {
    return {
      name: legacy[1].trim(),
      path: parseFileRefToken(legacy[2].trim())
    };
  }

  return { name: value.trim() };
}

function parseEnforcementActionIndexLine(
  line: string
): { name: string; file: string } | null {
  const shorthand = line.match(/^-\s*Enforcement Action:\s*\[([^\]]+)\]\s*$/);
  if (shorthand) {
    const name = shorthand[1].trim();
    return {
      name,
      file: enforcementActionFileRef(name)
    };
  }

  const linked = line.match(/^\-\s*Enforcement Action:\s*\[([^\]]+)\]\((.+)\)\s*$/);
  if (linked) {
    return {
      name: linked[1].trim(),
      file: linked[2].trim().replace(/\\/g, '/')
    };
  }

  const legacy = line.match(/^\-\s*Enforcement Action:\s*([^|]+?)\s*\|\s*File:\s*(.+)$/);
  if (!legacy) {
    return null;
  }

  return {
    name: legacy[1].trim(),
    file: parseFileRefToken(legacy[2].trim())
  };
}

export function ensureNode(
  children: ProvisionNode[],
  level: number,
  name: string
): ProvisionNode {
  const existing = children.find((child) => child.level === level && child.name === name);
  if (existing) {
    return existing;
  }

  const node: ProvisionNode = { level, name, children: [] };
  children.push(node);
  children.sort((a, b) => a.name.localeCompare(b.name));
  return node;
}

export async function readConceptIndex(): Promise<ConceptEntry[]> {
  const raw = await fs.readFile(indexConceptsPath(), 'utf8');
  const lines = raw.split(/\r?\n/).map((line) => line.trim());

  const concepts: ConceptEntry[] = [];
  let current: ConceptEntry | null = null;

  for (const line of lines) {
    if (!line || line.startsWith('#') || line === '---') {
      continue;
    }

    const conceptEntry = parseConceptIndexLine(line);
    if (conceptEntry) {
      current = {
        name: conceptEntry.name,
        file: conceptEntry.file,
        subconcepts: []
      };
      concepts.push(current);
      continue;
    }

    const subconceptEntry = parseSubconceptIndexLine(line, current?.name);
    if (subconceptEntry && current) {
      const value = subconceptEntry.name;
      if (!current.subconcepts.some((entry) => entry.name === value)) {
        current.subconcepts.push({ name: value, file: subconceptEntry.file });
      }
    }
  }

  return concepts;
}

export async function writeConceptIndex(concepts: ConceptEntry[]): Promise<void> {
  const sorted = [...concepts].sort((a, b) => a.name.localeCompare(b.name));
  const lines: string[] = ['# Concept Index', ''];

  for (const concept of sorted) {
    lines.push(`- Concept: [${concept.name}](${concept.file})`);
    for (const subconcept of [...concept.subconcepts].sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`  - Subconcept: [${subconcept.name}](${subconcept.file})`);
    }
  }

  lines.push('');
  await fs.writeFile(indexConceptsPath(), lines.join('\n'), 'utf8');
}

export async function readJurisdictionIndex(): Promise<JurisdictionEntry[]> {
  const raw = await fs.readFile(indexJurisdictionPath(), 'utf8');
  const lines = raw.split(/\r?\n/).map((line) => line.trim());

  const jurisdictions: JurisdictionEntry[] = [];
  let currentJurisdiction: JurisdictionEntry | null = null;
  let currentLaw: { name: string; provisions: ProvisionNode[] } | null = null;
  const stack: Array<ProvisionNode | undefined> = [];

  for (const line of lines) {
    if (!line || line.startsWith('#') || line === '---') {
      continue;
    }

    const jurisdictionMatch = line.match(/^\-\s*Jurisdiction:\s*(.+)$/);
    if (jurisdictionMatch) {
      const parsed = parseLinkedOrPlainValue(jurisdictionMatch[1]);
      currentJurisdiction = { name: parsed.name, laws: [] };
      jurisdictions.push(currentJurisdiction);
      currentLaw = null;
      stack.length = 0;
      continue;
    }

    const lawMatch = line.match(/^\-\s*Law:\s*(.+)$/);
    if (lawMatch && currentJurisdiction) {
      const parsed = parseLinkedOrPlainValue(lawMatch[1]);
      currentLaw = { name: parsed.name, provisions: [] };
      currentJurisdiction.laws.push(currentLaw);
      stack.length = 0;
      continue;
    }

    const levelMatch = line.match(/^\-\s*Level_(\d+):\s*(.+)$/);
    if (levelMatch && currentLaw) {
      const level = Number.parseInt(levelMatch[1], 10);
      const parsed = parseLinkedOrPlainValue(levelMatch[2]);
      const node: ProvisionNode = { level, name: parsed.name, children: [] };

      if (level === 1) {
        currentLaw.provisions.push(node);
      } else {
        const parent = stack[level - 1];
        if (parent) {
          parent.children.push(node);
        }
      }

      stack[level] = node;
      stack.length = level + 1;
    }
  }

  return jurisdictions;
}

export async function writeJurisdictionIndex(
  jurisdictions: JurisdictionEntry[]
): Promise<void> {
  const sortedJurisdictions = [...jurisdictions].sort((a, b) => a.name.localeCompare(b.name));
  const lines: string[] = ['# Jurisdiction Index', ''];

  const renderNodes = (nodes: ProvisionNode[], indent: number, parentDir: string): void => {
    const prefix = ' '.repeat(indent);
    for (const node of [...nodes].sort((a, b) => a.name.localeCompare(b.name))) {
      const levelDir = path.posix.join(parentDir, `Level_${node.level}`, node.name);
      const nodeFile = path.posix.join(levelDir, `${node.name}.md`);
      lines.push(`${prefix}- Level_${node.level}: [${node.name}](${nodeFile})`);
      renderNodes(node.children, indent + 2, levelDir);
    }
  };

  sortedJurisdictions.forEach((jurisdiction, index) => {
    lines.push(
      `- Jurisdiction: [${jurisdiction.name}](${jurisdictionFileRef(jurisdiction.name)})`
    );
    const laws = [...jurisdiction.laws].sort((a, b) => a.name.localeCompare(b.name));
    for (const law of laws) {
      const lawDir = lawDirectoryRef(jurisdiction.name, law.name);
      lines.push(`  - Law: [${law.name}](${lawDir})`);
      renderNodes(law.provisions, 4, lawDir);
    }

    if (index < sortedJurisdictions.length - 1) {
      lines.push('');
    }
  });

  lines.push('');
  await fs.writeFile(indexJurisdictionPath(), lines.join('\n'), 'utf8');
}

export async function readEnforcementActionIndex(): Promise<EnforcementActionEntry[]> {
  if (!(await fs.pathExists(indexEnforcementActionsPath()))) {
    return [];
  }

  const raw = await fs.readFile(indexEnforcementActionsPath(), 'utf8');
  const lines = raw.split(/\r?\n/).map((line) => line.trim());
  const entries: EnforcementActionEntry[] = [];

  for (const line of lines) {
    if (!line || line.startsWith('#') || line === '---') {
      continue;
    }

    const parsed = parseEnforcementActionIndexLine(line);
    if (!parsed) {
      continue;
    }

    if (!entries.some((entry) => entry.name === parsed.name)) {
      entries.push(parsed);
    }
  }

  return entries;
}

export async function writeEnforcementActionIndex(
  entries: EnforcementActionEntry[]
): Promise<void> {
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  const lines: string[] = ['# Enforcement Action Index', ''];
  for (const entry of sorted) {
    lines.push(`- Enforcement Action: [${entry.name}](${entry.file})`);
  }
  lines.push('');
  await fs.writeFile(indexEnforcementActionsPath(), lines.join('\n'), 'utf8');
}
