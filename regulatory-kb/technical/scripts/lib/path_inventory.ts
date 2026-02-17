import { execFile } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface PathInventory {
  directories: string[];
  files: string[];
}

function normalizePath(value: string): string {
  return value
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function sortPaths(paths: Iterable<string>): string[] {
  return Array.from(paths).sort((a, b) => a.localeCompare(b));
}

function deriveDirectories(files: string[]): string[] {
  const directories = new Set<string>();

  for (const file of files) {
    const segments = file.split('/');
    segments.pop();

    let current = '';
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      directories.add(current);
    }
  }

  return sortPaths(directories);
}

export async function listRepositoryFiles(): Promise<string[]> {
  const [tracked, untracked] = await Promise.all([
    execFileAsync('git', ['ls-files', '-z'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024
    }),
    execFileAsync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024
    })
  ]);

  const candidates = `${tracked.stdout}${untracked.stdout}`
    .split('\u0000')
    .map((value) => normalizePath(value))
    .filter((value) => value.length > 0);

  const existingFiles = (
    await Promise.all(
      candidates.map(async (relativeFile) => {
        const absolutePath = path.join(process.cwd(), relativeFile);
        return (await fs.pathExists(absolutePath)) ? relativeFile : null;
      })
    )
  ).filter((value): value is string => value !== null);

  return sortPaths(new Set(existingFiles));
}

export async function getPathInventory(): Promise<PathInventory> {
  const files = await listRepositoryFiles();
  const directories = deriveDirectories(files);

  return {
    directories,
    files
  };
}
