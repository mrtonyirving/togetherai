import fs from 'fs-extra';

import { getRunOptions, listJsonFiles, repoPath, toPosixRelative, writeJsonFile } from './lib/io.js';

async function resolveGeneratedAt(files: string[]): Promise<string> {
  const dataFiles = files.filter((file) => file !== 'manifest.json');
  if (dataFiles.length === 0) {
    const existingManifestPath = repoPath('technical', 'artifacts', 'manifest.json');
    if (await fs.pathExists(existingManifestPath)) {
      const existingManifest = await fs.readJson(existingManifestPath);
      if (
        existingManifest &&
        typeof existingManifest === 'object' &&
        typeof existingManifest.generated_at === 'string'
      ) {
        return existingManifest.generated_at;
      }
    }
    return new Date(0).toISOString();
  }

  const statResults = await Promise.all(
    dataFiles.map(async (file) => fs.stat(repoPath('technical', 'artifacts', file)))
  );
  const latestModifiedMs = statResults.reduce(
    (latest, statResult) => Math.max(latest, statResult.mtimeMs),
    0
  );
  return new Date(latestModifiedMs).toISOString();
}

async function main(): Promise<void> {
  const options = getRunOptions(process.argv.slice(2));
  const artifactsDir = repoPath('technical', 'artifacts');

  await fs.ensureDir(artifactsDir);

  const files = await listJsonFiles(artifactsDir);
  const generatedAt = await resolveGeneratedAt(files);
  const manifest = {
    generator: 'regulatory-kb-ts',
    version: '1.0.0',
    generated_at: generatedAt,
    file_count: files.length,
    files
  };

  const outFile = repoPath('technical', 'artifacts', 'manifest.json');
  const result = await writeJsonFile(outFile, manifest, { check: options.check });

  if (options.check) {
    if (result.changed) {
      console.error(`Would update ${toPosixRelative(outFile)}`);
      process.exit(1);
    }
    console.log('generate_manifest.ts check passed.');
    return;
  }

  const status = result.changed ? 'Updated' : 'No changes';
  console.log(`${status} ${toPosixRelative(outFile)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
