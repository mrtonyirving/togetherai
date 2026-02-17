import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { withTempCwd, writeFixtureFile } from './test_fs.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '../../..');
const SCAFFOLD_SCRIPT = path.join(REPO_ROOT, 'technical/scripts/scaffold.ts');
const TSX_IMPORT = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');

async function seedConceptFixtures(root: string): Promise<void> {
  await writeFixtureFile(
    root,
    'library/taxonomy/index_concepts.md',
    `
# Concept Index

- Concept: [general_risk_assessment](AML/concepts/general_risk_assessment/general_risk_assessment.md)
  - Subconcept: [general_risk_assessment_product](AML/concepts/general_risk_assessment/subconcepts/general_risk_assessment_product/general_risk_assessment_product.md)
`
  );

  await writeFixtureFile(
    root,
    'library/taxonomy/AML/concepts/general_risk_assessment/general_risk_assessment.md',
    `
# general_risk_assessment

## metadata
- concept_id: general_risk_assessment
- concept_slug: general_risk_assessment
- kind: concept

## references
`
  );

  await writeFixtureFile(
    root,
    'library/taxonomy/AML/concepts/general_risk_assessment/subconcepts/general_risk_assessment_product/general_risk_assessment_product.md',
    `
# general_risk_assessment_product

## metadata
- concept_id: general_risk_assessment_product
- concept_slug: general_risk_assessment_product
- kind: subconcept
- parent_concept_id: general_risk_assessment

## references
`
  );
}

function runEnforcementScaffold(root: string, args: string[]) {
  return spawnSync(
    process.execPath,
    ['--import', TSX_IMPORT, SCAFFOLD_SCRIPT, 'enforcement-action', ...args],
    {
      cwd: root,
      encoding: 'utf8'
    }
  );
}

function enforcementRequiredArgs(diarienummer: string): string[] {
  return [
    '--jurisdiction', 'Sweden',
    '--diarienummer', diarienummer,
    '--affected-entity-name', 'Example Bank AB',
    '--entity-type', 'credit_institution',
    '--decision-type', 'warning',
    '--fine', 'no'
  ];
}

test('enforcement-action scaffold accepts no statutory references and prints warning', async () => {
  await withTempCwd('scaffold-no-statutory-', async (root) => {
    await seedConceptFixtures(root);

    const result = runEnforcementScaffold(root, [
      '--slug', 'no_statutory',
      ...enforcementRequiredArgs('23-13249')
    ]);

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const combinedOutput = `${result.stdout}\n${result.stderr}`;
    assert.match(combinedOutput, /without statutory references/i);
    assert.match(combinedOutput, /## statutory_references/i);

    const outputPath = path.join(
      root,
      'library/ontologies/document-types/enforcement-actions/jurisdictions/se/examples/enforcement-actions/no_statutory.md'
    );
    const generated = await fs.readFile(outputPath, 'utf8');
    assert.match(generated, /^## concepts_covered$/m);
    assert.match(generated, /^## statutory_references$/m);
    assert.doesNotMatch(generated, /^### ref_\d+$/m);
  });
});

test('enforcement-action scaffold writes structured concepts_covered blocks', async () => {
  await withTempCwd('scaffold-concepts-covered-', async (root) => {
    await seedConceptFixtures(root);

    const result = runEnforcementScaffold(root, [
      '--slug', 'with_concepts',
      ...enforcementRequiredArgs('23-20000'),
      '--concepts-covered', 'general_risk_assessment_product,general_risk_assessment'
    ]);

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const outputPath = path.join(
      root,
      'library/ontologies/document-types/enforcement-actions/jurisdictions/se/examples/enforcement-actions/with_concepts.md'
    );
    const generated = await fs.readFile(outputPath, 'utf8');

    assert.match(
      generated,
      /## concepts_covered[\s\S]*### concept_1[\s\S]*- concept_id: general_risk_assessment[\s\S]*### concept_2[\s\S]*- concept_id: general_risk_assessment_product/
    );
    assert.doesNotMatch(generated, /^### ref_\d+$/m);
  });
});

test('enforcement-action scaffold rejects invalid concept_id format', async () => {
  await withTempCwd('scaffold-invalid-concept-format-', async (root) => {
    await seedConceptFixtures(root);

    const result = runEnforcementScaffold(root, [
      '--slug', 'bad_format',
      ...enforcementRequiredArgs('23-20001'),
      '--concepts-covered', '123-invalid'
    ]);

    assert.notEqual(result.status, 0);
    const combinedOutput = `${result.stdout}\n${result.stderr}`;
    assert.match(combinedOutput, /Invalid concept_id '123-invalid'/);
  });
});

test('enforcement-action scaffold rejects unknown concept_id', async () => {
  await withTempCwd('scaffold-unknown-concept-id-', async (root) => {
    await seedConceptFixtures(root);

    const result = runEnforcementScaffold(root, [
      '--slug', 'unknown_concept',
      ...enforcementRequiredArgs('23-20002'),
      '--concepts-covered', 'unknown_concept'
    ]);

    assert.notEqual(result.status, 0);
    const combinedOutput = `${result.stdout}\n${result.stderr}`;
    assert.match(combinedOutput, /Unknown concept_id 'unknown_concept' not found in taxonomy concept index\/files/);
  });
});
