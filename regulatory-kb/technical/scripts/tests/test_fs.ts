import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

export async function withTempCwd(
  prefix: string,
  run: (root: string) => Promise<void>
): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const realRoot = await fs.realpath(root);
  const originalCwd = process.cwd();

  try {
    process.chdir(realRoot);
    await run(realRoot);
  } finally {
    process.chdir(originalCwd);
    await fs.remove(realRoot);
  }
}

export async function writeFixtureFile(
  root: string,
  relativePath: string,
  content: string
): Promise<void> {
  const absolutePath = path.join(root, relativePath);
  await fs.ensureDir(path.dirname(absolutePath));
  const normalized = `${content.trim()}\n`;
  await fs.writeFile(absolutePath, normalized, 'utf8');
}
