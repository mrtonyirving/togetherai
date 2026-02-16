#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const DOCS_ROOT = path.join(ROOT, 'docs');

const args = process.argv.slice(2);
const changedOnly = args.includes('--changed-only');
const base = getArgValue('--base');
const head = getArgValue('--head');

const excludedDirs = new Set(['templates']);

function getArgValue(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function safeRead(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function walkDirs(startDir) {
  const dirs = [];
  const stack = [startDir];
  while (stack.length > 0) {
    const current = stack.pop();
    dirs.push(current);
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue;
        stack.push(path.join(current, entry.name));
      }
    }
  }
  return dirs;
}

function collectDirsToCheck() {
  if (!changedOnly) return walkDirs(DOCS_ROOT);

  if (!base || !head) {
    throw new Error('When using --changed-only you must pass --base and --head');
  }

  const cmd = `git diff --name-only ${base}...${head} -- docs`;
  const out = execSync(cmd, { encoding: 'utf8' }).trim();
  if (!out) return [];

  const changedFiles = out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => file.endsWith('.md'));

  const dirs = new Set();
  for (const relFile of changedFiles) {
    const abs = path.join(ROOT, relFile);
    let current = path.dirname(abs);
    while (current.startsWith(DOCS_ROOT)) {
      dirs.add(current);
      if (current === DOCS_ROOT) break;
      current = path.dirname(current);
    }
  }

  return [...dirs];
}

function normalize(s) {
  return s.replace(/\\/g, '/');
}

function hasLink(readmeBody, relPath) {
  const checks = new Set([
    relPath,
    `./${relPath}`,
    relPath.replace('/README.md', '/'),
    relPath.replace('/README.md', ''),
  ]);
  for (const candidate of checks) {
    if (readmeBody.includes(candidate)) return true;
  }
  return false;
}

function isManaged(absDir) {
  const rel = normalize(path.relative(DOCS_ROOT, absDir));
  const top = rel.split('/')[0];
  return !excludedDirs.has(top || '');
}

function validateDir(absDir, failures) {
  if (!isManaged(absDir)) return;

  const readmePath = path.join(absDir, 'README.md');
  if (!fs.existsSync(readmePath)) return;

  const readme = safeRead(readmePath);
  const entries = fs.readdirSync(absDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
      const relPath = normalize(entry.name);
      if (!hasLink(readme, relPath)) {
        failures.push(`${normalize(path.relative(ROOT, readmePath))} missing link to ${relPath}`);
      }
    }

    if (entry.isDirectory()) {
      const childReadme = path.join(absDir, entry.name, 'README.md');
      if (fs.existsSync(childReadme)) {
        const relPath = normalize(path.join(entry.name, 'README.md'));
        if (!hasLink(readme, relPath)) {
          failures.push(`${normalize(path.relative(ROOT, readmePath))} missing link to ${entry.name}/README.md`);
        }
      }
    }
  }
}

if (!fs.existsSync(DOCS_ROOT)) {
  console.error('docs directory not found');
  process.exit(1);
}

const dirs = collectDirsToCheck();
const failures = [];
for (const dir of dirs) validateDir(dir, failures);

if (failures.length > 0) {
  console.error('Index validation failed:');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log('Index validation passed.');
