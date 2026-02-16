#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DOCS = path.join(ROOT, 'docs');

const args = process.argv.slice(2);
const jsonOut = valueAfter('--json-out');
const mdOut = valueAfter('--md-out');

const RFC_PRD_DAYS = Number(process.env.RFC_PRD_STALE_DAYS || 45);
const POLICY_RUNBOOK_DAYS = Number(process.env.POLICY_RUNBOOK_STALE_DAYS || 90);

function valueAfter(flag) {
  const idx = args.indexOf(flag);
  return idx === -1 ? undefined : args[idx + 1];
}

function walk(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') out.push(abs);
  }
  return out;
}

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const obj = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
    obj[key] = value;
  }
  return obj;
}

function daysSince(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
  const now = new Date();
  return Math.floor((now - d) / (1000 * 60 * 60 * 24));
}

function thresholdFor(rel) {
  if (rel.includes('/architecture/rfcs/') || rel.includes('/product/prds/')) return RFC_PRD_DAYS;
  if (rel.includes('/policies/') || rel.includes('/runbooks/')) return POLICY_RUNBOOK_DAYS;
  return null;
}

const files = walk(DOCS);
const stale = [];

for (const abs of files) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  const threshold = thresholdFor(rel);
  if (threshold === null) continue;

  const fm = parseFrontmatter(fs.readFileSync(abs, 'utf8'));
  const reviewed = fm.last_reviewed || '';
  const ageDays = daysSince(reviewed);

  if (ageDays > threshold) {
    stale.push({
      file: rel,
      owner: fm.owner || '@unassigned',
      title: fm.title || path.basename(abs),
      last_reviewed: reviewed || 'missing',
      age_days: Number.isFinite(ageDays) ? ageDays : 'unknown',
      threshold_days: threshold,
    });
  }
}

const md = [
  '# Stale Documentation Review',
  '',
  `Found ${stale.length} stale doc(s).`,
  '',
  '| File | Owner | Last reviewed | Age (days) | Threshold |',
  '| --- | --- | --- | ---: | ---: |',
  ...stale.map(
    (item) =>
      `| ${item.file} | ${item.owner} | ${item.last_reviewed} | ${item.age_days} | ${item.threshold_days} |`,
  ),
  '',
  '## Next actions',
  '',
  '- Assign owners and update `last_reviewed` after content verification.',
  '- Close this reminder once all stale docs are refreshed.',
  '',
].join('\n');

if (jsonOut) fs.writeFileSync(jsonOut, `${JSON.stringify(stale, null, 2)}\n`);
if (mdOut) fs.writeFileSync(mdOut, md);

if (!jsonOut && !mdOut) {
  console.log(md);
}

console.log(`Stale docs found: ${stale.length}`);
