import fg from 'fast-glob';
import fs from 'fs-extra';

import { readStructuredMarkdownDoc } from './lib/structured_markdown.js';
import { getRunOptions, repoPath, toPosixRelative, writeJsonFile } from './lib/io.js';

const LIBRARY_DIR = repoPath('library');
const ARTIFACTS_DIR = repoPath('technical', 'artifacts');
const ONTOLOGY_FILE = repoPath(
  'library',
  'ontologies',
  'document-types',
  'enforcement-actions',
  'jurisdictions',
  'se',
  'enforcement-actions.md'
);

const ONTOLOGY_DIR = repoPath('technical', 'artifacts', 'ontologies');
const ONTOLOGY_JSON = repoPath('technical', 'artifacts', 'ontologies', 'enforcement-actions.json');

function logArtifactUpdate(check: boolean, filePath: string, entryCount: number): void {
  const status = check ? 'Would update' : 'Updated';
  console.log(`${status} ${toPosixRelative(filePath)} (${entryCount} entries)`);
}

async function pruneOntologyDir(check: boolean): Promise<number> {
  if (!(await fs.pathExists(ONTOLOGY_DIR))) {
    return 0;
  }

  const files = await fg('**/*.json', {
    cwd: ONTOLOGY_DIR,
    onlyFiles: true,
    dot: false
  });

  let changes = 0;
  for (const rel of files) {
    if (rel === 'enforcement-actions.json') {
      continue;
    }

    const abs = repoPath('technical', 'artifacts', 'ontologies', rel);
    changes += 1;

    if (check) {
      console.log(`Would remove ${toPosixRelative(abs)}`);
      continue;
    }

    await fs.remove(abs);
    console.log(`Removed ${toPosixRelative(abs)}`);
  }

  return changes;
}

async function pruneRemovedArtifactScopes(check: boolean): Promise<number> {
  const removedScopes = ['relations', 'sources'];
  let changes = 0;

  for (const scope of removedScopes) {
    const scopeDir = repoPath('technical', 'artifacts', scope);
    if (!(await fs.pathExists(scopeDir))) {
      continue;
    }

    const files = await fg('**/*.json', {
      cwd: scopeDir,
      onlyFiles: true,
      dot: false
    });

    if (files.length === 0) {
      if (!check) {
        await fs.remove(scopeDir);
      }
      continue;
    }

    changes += files.length;
    if (check) {
      for (const rel of files) {
        console.log(`Would remove ${toPosixRelative(repoPath('technical', 'artifacts', scope, rel))}`);
      }
      continue;
    }

    await fs.remove(scopeDir);
    console.log(`Removed ${toPosixRelative(scopeDir)}`);
  }

  return changes;
}

async function buildOntologyIndex(check: boolean): Promise<number> {
  const doc = await readStructuredMarkdownDoc(ONTOLOGY_FILE);
  if (!doc) {
    throw new Error(`Could not parse ontology file: ${toPosixRelative(ONTOLOGY_FILE)}`);
  }

  const entries = [
    {
      ...doc.metadata,
      _source_file: doc.relativePath
    }
  ];

  const result = await writeJsonFile(ONTOLOGY_JSON, entries, { check });
  if (result.changed) {
    logArtifactUpdate(check, ONTOLOGY_JSON, entries.length);
  }

  return result.changed ? 1 : 0;
}

async function main(): Promise<void> {
  const options = getRunOptions(process.argv.slice(2));

  if (!(await fs.pathExists(LIBRARY_DIR))) {
    throw new Error('library directory not found');
  }

  if (!options.check) {
    await fs.ensureDir(ARTIFACTS_DIR);
    await fs.ensureDir(ONTOLOGY_DIR);
  }

  let changes = 0;
  changes += await pruneOntologyDir(options.check);
  changes += await pruneRemovedArtifactScopes(options.check);
  changes += await buildOntologyIndex(options.check);

  if (options.check) {
    if (changes > 0) {
      console.error(`\n${changes} artifact file(s) would be updated by build_json.ts`);
      process.exit(1);
    }
    console.log('build_json.ts check passed.');
    return;
  }

  console.log(`\nDone. ${changes} artifact file(s) updated by build_json.ts.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
