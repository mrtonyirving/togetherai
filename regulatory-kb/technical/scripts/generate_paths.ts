import { getPathInventory } from './lib/path_inventory.js';
import { getRunOptions, repoPath, toPosixRelative, writeTextFile } from './lib/io.js';

function renderPathsMarkdown(directories: string[], files: string[]): string {
  const lines: string[] = [
    '# Paths',
    '',
    'Generated inventory of all repository paths.',
    '',
    '## Scope',
    '',
    '- Source of truth: `git ls-files` (tracked + untracked, excluding ignored files)',
    '- Update mode: full regeneration (deterministic)',
    '- Coverage: repository directories and repository files',
    '',
    `## Directories (${directories.length})`,
    ''
  ];

  if (directories.length === 0) {
    lines.push('_No tracked directories found._', '');
  } else {
    for (const directory of directories) {
      lines.push(`- \`${directory}/\``);
    }
    lines.push('');
  }

  lines.push(`## Files (${files.length})`, '');

  if (files.length === 0) {
    lines.push('_No tracked files found._', '');
  } else {
    for (const file of files) {
      lines.push(`- \`${file}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const options = getRunOptions(process.argv.slice(2));
  const inventory = await getPathInventory();
  const outFile = repoPath('technical', 'docs', 'compass', 'paths.md');
  const markdown = renderPathsMarkdown(inventory.directories, inventory.files);
  const result = await writeTextFile(outFile, markdown, options);

  if (options.check) {
    if (result.changed) {
      console.error(`Would update ${toPosixRelative(outFile)}`);
      process.exit(1);
    }
    console.log('generate_paths.ts check passed.');
    return;
  }

  const status = result.changed ? 'Updated' : 'No changes';
  console.log(`${status} ${toPosixRelative(outFile)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
