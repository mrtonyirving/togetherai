import fs from 'fs-extra';

import { repoPath, toPosixRelative } from './lib/io.js';

async function main(): Promise<void> {
  const src = repoPath('technical', 'artifacts');
  const dst = repoPath('public', 'artifacts');

  if (!(await fs.pathExists(src))) {
    throw new Error('technical/artifacts directory not found; run kb:build-all first');
  }

  await fs.remove(dst);
  await fs.copy(src, dst, {
    overwrite: true
  });

  console.log(`Published ${toPosixRelative(src)} -> ${toPosixRelative(dst)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
