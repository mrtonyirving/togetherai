import { getPathInventory } from './lib/path_inventory.js';
import { getRunOptions, repoPath, toPosixRelative, writeTextFile } from './lib/io.js';

interface RootSummary {
  root: string;
  directoryCount: number;
  fileCount: number;
}

function extractRoot(path: string): string {
  const separatorIndex = path.indexOf('/');
  return separatorIndex === -1 ? '.' : path.slice(0, separatorIndex);
}

function rootSort(a: string, b: string): number {
  if (a === '.' && b !== '.') {
    return -1;
  }
  if (a !== '.' && b === '.') {
    return 1;
  }
  return a.localeCompare(b);
}

function getAnchor(root: string): string {
  if (root === '.') {
    return 'root-files';
  }

  return `root-${root
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')}`;
}

function getRootLabel(root: string): string {
  return root === '.' ? 'Root Files' : root;
}

function buildRootSummaries(directories: string[], files: string[]): RootSummary[] {
  const roots = new Set<string>();

  for (const directory of directories) {
    roots.add(extractRoot(directory));
  }
  for (const file of files) {
    roots.add(extractRoot(file));
  }

  return Array.from(roots)
    .sort(rootSort)
    .map((root) => {
      const directoryCount = directories.filter((directory) => extractRoot(directory) === root).length;
      const fileCount = files.filter((file) => extractRoot(file) === root).length;

      return {
        root,
        directoryCount,
        fileCount
      };
    });
}

function getDirectPaths(root: string, paths: string[]): string[] {
  if (root === '.') {
    return paths.filter((path) => !path.includes('/'));
  }

  const prefix = `${root}/`;
  return paths.filter((path) => {
    if (!path.startsWith(prefix)) {
      return false;
    }
    const relative = path.slice(prefix.length);
    return relative.length > 0 && !relative.includes('/');
  });
}

function renderList(values: string[], suffix = ''): string {
  if (values.length === 0) {
    return '_None_';
  }

  return values.map((value) => `\`${value}${suffix}\``).join(', ');
}

function renderCompassMarkdown(directories: string[], files: string[]): string {
  const summaries = buildRootSummaries(directories, files);
  const lines: string[] = [
    '# Compass',
    '',
    'High-level navigation index for this repository.',
    '',
    '## Scope',
    '',
    '- Source of truth: `git ls-files` (tracked + untracked, excluding ignored files)',
    '- Update mode: full regeneration (deterministic)',
    '- Coverage: repository directories and repository files',
    '- Full path inventory: [paths.md](./paths.md)',
    '',
    '## Quick Navigation',
    '',
    '- [All repository paths](./paths.md)'
  ];

  for (const summary of summaries) {
    lines.push(`- [${getRootLabel(summary.root)}](#${getAnchor(summary.root)})`);
  }

  lines.push('', '## Top-Level Summary', '', '| Root | Directories | Files | Total |', '| --- | ---: | ---: | ---: |');

  for (const summary of summaries) {
    const total = summary.directoryCount + summary.fileCount;
    lines.push(`| \`${summary.root}\` | ${summary.directoryCount} | ${summary.fileCount} | ${total} |`);
  }

  lines.push('', '## Root Sections', '');

  for (const summary of summaries) {
    const directDirectories = getDirectPaths(summary.root, directories);
    const directFiles = getDirectPaths(summary.root, files);

    lines.push(
      `<a id="${getAnchor(summary.root)}"></a>`,
      `### ${getRootLabel(summary.root)}`,
      '',
      `- Total directories: ${summary.directoryCount}`,
      `- Total files: ${summary.fileCount}`,
      `- Direct directories: ${renderList(directDirectories, '/')}`,
      `- Direct files: ${renderList(directFiles)}`,
      ''
    );
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const options = getRunOptions(process.argv.slice(2));
  const inventory = await getPathInventory();
  const outFile = repoPath('technical', 'docs', 'compass', 'index.md');
  const markdown = renderCompassMarkdown(inventory.directories, inventory.files);
  const result = await writeTextFile(outFile, markdown, options);

  if (options.check) {
    if (result.changed) {
      console.error(`Would update ${toPosixRelative(outFile)}`);
      process.exit(1);
    }
    console.log('generate_compass.ts check passed.');
    return;
  }

  const status = result.changed ? 'Updated' : 'No changes';
  console.log(`${status} ${toPosixRelative(outFile)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
