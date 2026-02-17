import fg from 'fast-glob';
import fs from 'fs-extra';
import path from 'node:path';

export interface RunOptions {
  check: boolean;
}

export function getRunOptions(argv: string[]): RunOptions {
  return {
    check: argv.includes('--check')
  };
}

export function repoPath(...parts: string[]): string {
  return path.join(process.cwd(), ...parts);
}

export function toPosixRelative(filePath: string): string {
  return path.relative(process.cwd(), filePath).split(path.sep).join('/');
}

export async function ensureParentDir(filePath: string): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
}

export function stableJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function stableText(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}

export interface WriteResult {
  changed: boolean;
  wrote: boolean;
}

export async function writeJsonFile(
  filePath: string,
  data: unknown,
  options: RunOptions
): Promise<WriteResult> {
  const next = stableJson(data);
  let current: string | null = null;

  if (await fs.pathExists(filePath)) {
    current = await fs.readFile(filePath, 'utf8');
  }

  if (current === next) {
    return { changed: false, wrote: false };
  }

  if (options.check) {
    return { changed: true, wrote: false };
  }

  await ensureParentDir(filePath);
  await fs.writeFile(filePath, next, 'utf8');
  return { changed: true, wrote: true };
}

export async function writeTextFile(
  filePath: string,
  content: string,
  options: RunOptions
): Promise<WriteResult> {
  const next = stableText(content);
  let current: string | null = null;

  if (await fs.pathExists(filePath)) {
    current = await fs.readFile(filePath, 'utf8');
  }

  if (current === next) {
    return { changed: false, wrote: false };
  }

  if (options.check) {
    return { changed: true, wrote: false };
  }

  await ensureParentDir(filePath);
  await fs.writeFile(filePath, next, 'utf8');
  return { changed: true, wrote: true };
}

export async function listJsonFiles(rootDir: string): Promise<string[]> {
  if (!(await fs.pathExists(rootDir))) {
    return [];
  }

  const files = await fg('**/*.json', {
    cwd: rootDir,
    dot: false,
    onlyFiles: true
  });

  return files.sort();
}
