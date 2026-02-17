import fs from 'fs-extra';
import path from 'node:path';

import { repoPath } from '../io.js';
import {
  formatReferenceBlocksFromAddresses,
  referenceHierarchyFromAddress,
} from '../reference_contract.js';

export function levelLabel(level: number): string {
  if (level === 1) return 'Kapitel';
  if (level === 2) return 'Paragraf';
  if (level === 3) return 'Stycke';
  return 'Punkt';
}

export function levelName(level: number, value: number): string {
  if (level === 1) return `Kapitel_${value}`;
  if (level === 2) return `Paragraf_${value}`;
  if (level === 3) return `Stycke_${value}`;
  return `Punkt_${value}`;
}

export interface EnsureProvisionFileInput {
  address: string;
  lawName?: string;
  jurisdictionName?: string;
  topics: string[];
}

export function provisionHierarchyFromAddress(address: string): {
  jurisdictionName: string;
  lawName: string;
  nodes: Array<{ level: number; name: string }>;
} {
  return referenceHierarchyFromAddress(address);
}

export async function ensureProvisionFile(
  input: EnsureProvisionFileInput
): Promise<string> {
  const hierarchy = referenceHierarchyFromAddress(input.address);
  const jurisdictionName = input.jurisdictionName ?? hierarchy.jurisdictionName;
  const lawName = input.lawName ?? hierarchy.lawName;
  const nodes = hierarchy.nodes;

  if (nodes.length === 0) {
    throw new Error(`Reference '${input.address}' does not map to a provision hierarchy`);
  }

  let nodeDir = repoPath(
    'library',
    'taxonomy',
    'AML',
    'map',
    jurisdictionName,
    'legislation',
    lawName
  );

  for (const node of nodes) {
    nodeDir = path.join(nodeDir, `Level_${node.level}`, node.name);
  }

  await fs.ensureDir(nodeDir);
  const leaf = nodes[nodes.length - 1];
  const leafFile = path.join(nodeDir, `${leaf.name}.md`);

  const existing = (await fs.pathExists(leafFile))
    ? await fs.readFile(leafFile, 'utf8')
    : '';
  if (existing.trim().length === 0) {
    const references = formatReferenceBlocksFromAddresses([input.address]);
    const topicLines = Array.from(
      new Set(input.topics.map((topic) => topic.trim()).filter(Boolean))
    )
      .sort((a, b) => a.localeCompare(b))
      .map((topic) => `- ${topic}`);

    const content = [
      `# ${leaf.name}`,
      '',
      '## references',
      ...references,
      '',
      '## topics',
      ...topicLines,
      ''
    ].join('\n');

    await fs.writeFile(leafFile, content, 'utf8');
  }

  return leafFile;
}
