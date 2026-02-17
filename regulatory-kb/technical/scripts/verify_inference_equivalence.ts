import fs from 'fs-extra';
import path from 'node:path';

import { loadInferenceMappingModel } from './lib/inference_mapping.js';
import { toPosixRelative } from './lib/io.js';

const INFERENCE_FILE = path.resolve(process.cwd(), '..', 'inference.ts');

function parseQuotedStrings(value: string): string[] {
  const out: string[] = [];
  const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    out.push(match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  }
  return out;
}

function buildSet(values: string[]): Set<string> {
  return new Set(values);
}

function diffSet(left: Set<string>, right: Set<string>): string[] {
  return Array.from(left).filter((value) => !right.has(value)).sort((a, b) => a.localeCompare(b));
}

function parseInferenceHardcoded(content: string): {
  subtopics: Set<string>;
  topicPairs: Set<string>;
  violations: Set<string>;
} {
  const subtopics = new Set<string>();
  const topicPairs = new Set<string>();
  const violations = new Set<string>();

  const subtopicRegex = /Relation\.IsSubtopic\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g;
  const violationRegex = /Relation\.Statutory_violation_of\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g;
  const topicMappingRegex = /Relation\.(?:TopicMappings|IsTopic)\(\s*"([^"]+)"\s*,\s*\[([\s\S]*?)\]\s*\)/g;

  let match: RegExpExecArray | null;
  while ((match = subtopicRegex.exec(content)) !== null) {
    subtopics.add(`${match[1]}::${match[2]}`);
  }

  while ((match = violationRegex.exec(content)) !== null) {
    violations.add(`${match[1]}::${match[2]}`);
  }

  while ((match = topicMappingRegex.exec(content)) !== null) {
    const topic = match[1];
    const addresses = parseQuotedStrings(match[2]);
    for (const address of addresses) {
      topicPairs.add(`${topic}::${address}`);
    }
  }

  return { subtopics, topicPairs, violations };
}

function renderDiff(title: string, missing: string[], extra: string[]): string {
  const lines: string[] = [];
  if (missing.length > 0) {
    lines.push(`${title} missing from inference.ts (${missing.length}):`);
    for (const item of missing) {
      lines.push(`- ${item}`);
    }
  }
  if (extra.length > 0) {
    lines.push(`${title} extra in inference.ts (${extra.length}):`);
    for (const item of extra) {
      lines.push(`- ${item}`);
    }
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  if (!(await fs.pathExists(INFERENCE_FILE))) {
    throw new Error(`inference.ts not found at ${toPosixRelative(INFERENCE_FILE)}`);
  }

  const [model, inferenceSource] = await Promise.all([
    loadInferenceMappingModel(),
    fs.readFile(INFERENCE_FILE, 'utf8')
  ]);

  if (inferenceSource.includes('relations.generated')) {
    console.log('verify_inference_equivalence.ts passed (inference.ts is wired to generated relations).');
    return;
  }

  const parsed = parseInferenceHardcoded(inferenceSource);

  const generatedSubtopics = buildSet(
    model.relations.isSubtopics.map((row) => `${row.subtopic}::${row.parentTopic}`)
  );
  const generatedTopicPairs = buildSet(
    model.relations.topicMappings.flatMap((row) => row.addresses.map((address) => `${row.topic}::${address}`))
  );
  const generatedViolations = buildSet(
    model.relations.statutoryViolations.map(
      (row) => `${row.actionReference}::${row.statutoryReference}`
    )
  );

  const subtopicsMissing = diffSet(generatedSubtopics, parsed.subtopics);
  const subtopicsExtra = diffSet(parsed.subtopics, generatedSubtopics);
  const topicMissing = diffSet(generatedTopicPairs, parsed.topicPairs);
  const topicExtra = diffSet(parsed.topicPairs, generatedTopicPairs);
  const violationsMissing = diffSet(generatedViolations, parsed.violations);
  const violationsExtra = diffSet(parsed.violations, generatedViolations);

  const failures = [
    renderDiff('IS_SUBTOPIC', subtopicsMissing, subtopicsExtra),
    renderDiff('HAS_TOPIC', topicMissing, topicExtra),
    renderDiff('HAS_BROKEN_RULE', violationsMissing, violationsExtra)
  ].filter((chunk) => chunk.length > 0);

  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }

  console.log('verify_inference_equivalence.ts passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
