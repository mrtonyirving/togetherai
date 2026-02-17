import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  assertNoMarkdownTables,
  extractMarkdownSections,
  fieldListToProperties,
  fieldsToMap,
  getEnumValues,
  globMarkdown,
  parseBulletList,
  parseKeyValueBullets,
  parseSubsectionBlocks,
  readStructuredMarkdownDoc
} from '../lib/structured_markdown.js';
import { withTempCwd, writeFixtureFile } from './test_fs.js';

const SAMPLE_FILE = '/tmp/structured.md';

test('extractMarkdownSections normalizes section names and captures only H2 blocks', () => {
  const markdown = `
# Heading
Ignored text

## Metadata
- Key: value

### Not A Top Section
Still in metadata

## Validation Rules
- one
`;

  const sections = extractMarkdownSections(markdown);
  assert.deepEqual(Object.keys(sections), ['metadata', 'validation_rules']);
  assert.match(sections.metadata, /Key: value/);
  assert.match(sections.validation_rules, /- one/);
});

test('parseKeyValueBullets normalizes keys and rejects duplicates/invalid lines', () => {
  const parsed = parseKeyValueBullets(
    `
- Concept ID: General Risk Assessment
- concept_slug: general_risk_assessment
`,
    SAMPLE_FILE,
    'metadata'
  );
  assert.deepEqual(parsed, {
    concept_id: 'General Risk Assessment',
    concept_slug: 'general_risk_assessment'
  });

  assert.throws(
    () =>
      parseKeyValueBullets(
        `
- key: one
- key: two
`,
        SAMPLE_FILE,
        'metadata'
      ),
    /duplicate key 'key'/
  );

  assert.throws(
    () => parseKeyValueBullets('not-a-bullet', SAMPLE_FILE, 'metadata'),
    /must use '- key: value' bullet pairs/
  );
});

test('parseBulletList handles empty sections and rejects non-bullet lines', () => {
  assert.deepEqual(parseBulletList('\n\n', SAMPLE_FILE, 'topics'), []);
  assert.deepEqual(parseBulletList('- one\n- two', SAMPLE_FILE, 'topics'), ['one', 'two']);
  assert.throws(() => parseBulletList('one', SAMPLE_FILE, 'topics'), /must use '- value' bullets/);
});

test('parseSubsectionBlocks parses named blocks and validates structure', () => {
  const blocks = parseSubsectionBlocks(
    `
### ref_1
- law: 2017:630

### ref_2
- law: 2018:000
`,
    SAMPLE_FILE,
    'statutory_references'
  );

  assert.deepEqual(Object.keys(blocks), ['ref_1', 'ref_2']);
  assert.match(blocks.ref_1, /2017:630/);

  assert.throws(
    () => parseSubsectionBlocks('### ref_1\n\n### ref_2\n- a: b', SAMPLE_FILE, 'statutory_references'),
    /subsection 'ref_1' is empty/
  );

  assert.throws(
    () => parseSubsectionBlocks('- law: 2017:630', SAMPLE_FILE, 'statutory_references'),
    /must contain at least one '###' subsection/
  );
});

test('assertNoMarkdownTables rejects markdown table syntax', () => {
  assert.throws(
    () =>
      assertNoMarkdownTables(
        SAMPLE_FILE,
        `
| A | B |
|---|---|
| 1 | 2 |
`
      ),
    /uses markdown table syntax/
  );
});

test('readStructuredMarkdownDoc parses strict bullet ontology docs', async () => {
  await withTempCwd('structured-markdown-strict-', async (root) => {
    const relPath =
      'library/ontologies/document-types/enforcement-actions/jurisdictions/se/examples/enforcement-actions/strict-example.md';

    await writeFixtureFile(
      root,
      relPath,
      `
# Strict Example

## metadata
- title: Enforcement action
- version: 1

## fields
### reference_id
- type: string
- required: yes

### affected_regulations
- type: array<object>
- required: no

## affected_regulations_item
### law
- type: string
- required: yes

### chapter
- type: number
- required: yes

## validation_rules
- fine=yes => fine_amount,currency:required
`
    );

    const doc = await readStructuredMarkdownDoc(path.join(root, relPath));
    assert.ok(doc);

    const metadata = doc.metadata as Record<string, unknown>;
    const fields = metadata.fields as Record<string, Record<string, unknown>>;
    assert.equal(fields.reference_id.type, 'string');
    assert.equal(fields.reference_id.required, true);

    const affected = fields.affected_regulations;
    assert.equal(affected.type, 'array');
    const items = affected.items as Record<string, unknown>;
    assert.equal(items.type, 'object');
    const subFields = items.sub_fields as Array<Record<string, unknown>>;
    assert.equal(subFields.length, 2);
    assert.deepEqual(
      subFields.map((field) => field.name),
      ['law', 'chapter']
    );

    const validationRules = metadata.validation_rules as Array<Record<string, unknown>>;
    assert.equal(validationRules.length, 1);
    assert.deepEqual(validationRules[0].fields, ['fine_amount', 'currency']);
    assert.equal(validationRules[0].mode, 'required');
  });
});

test('readStructuredMarkdownDoc rejects table syntax on strict bullet paths', async () => {
  await withTempCwd('structured-markdown-strict-table-', async (root) => {
    const relPath =
      'library/ontologies/document-types/enforcement-actions/jurisdictions/se/examples/enforcement-actions/table-example.md';

    await writeFixtureFile(
      root,
      relPath,
      `
# Bad Strict Example

| key | value |
| --- | ----- |
| a   | b     |
`
    );

    await assert.rejects(
      readStructuredMarkdownDoc(path.join(root, relPath)),
      /uses markdown table syntax/
    );
  });
});

test('readStructuredMarkdownDoc rejects strict bullet docs missing required sections', async () => {
  await withTempCwd('structured-markdown-strict-missing-', async (root) => {
    const relPath =
      'library/ontologies/document-types/enforcement-actions/jurisdictions/se/examples/enforcement-actions/missing-sections.md';

    await writeFixtureFile(
      root,
      relPath,
      `
# Missing Sections

## metadata
- title: only metadata
`
    );

    await assert.rejects(
      readStructuredMarkdownDoc(path.join(root, relPath)),
      /is missing required bullet sections/
    );
  });
});

test('readStructuredMarkdownDoc parses legacy structured JSON blocks on non-strict paths', async () => {
  await withTempCwd('structured-markdown-legacy-', async (root) => {
    const relPath = 'library/ontologies/document-types/enforcement-actions/jurisdictions/dk/examples/example.md';

    await writeFixtureFile(
      root,
      relPath,
      `
<!-- kb:structured-data -->
\`\`\`json
{
  "title": "Legacy Example",
  "version": 1
}
\`\`\`

# Body
Legacy content
`
    );

    const doc = await readStructuredMarkdownDoc(path.join(root, relPath));
    assert.ok(doc);
    assert.equal(doc.metadata.title, 'Legacy Example');
    assert.equal(doc.metadata.version, 1);
    assert.match(doc.content, /# Body/);
  });
});

test('globMarkdown returns sorted absolute markdown paths', async () => {
  await withTempCwd('structured-markdown-glob-', async (root) => {
    await writeFixtureFile(root, 'library/taxonomy/beta.md', '# Beta');
    await writeFixtureFile(root, 'library/taxonomy/alpha.md', '# Alpha');

    const files = await globMarkdown('library/taxonomy/*.md');
    assert.deepEqual(files, [
      path.join(root, 'library/taxonomy/alpha.md'),
      path.join(root, 'library/taxonomy/beta.md')
    ]);
  });
});

test('fieldsToMap/fieldListToProperties/getEnumValues normalize helper inputs', () => {
  const fieldsFromList = fieldsToMap([
    { name: 'reference_id', type: 'string', required: true },
    { name: 'decision_type', type: 'enum', values: ['warning', 'fine'] }
  ]);
  assert.equal(fieldsFromList.reference_id.type, 'string');
  assert.deepEqual(getEnumValues(fieldsFromList.decision_type), ['warning', 'fine']);

  const fieldProps = fieldListToProperties([
    { name: 'law', type: 'string' },
    { name: 'paragraph', type: 'number' }
  ]);
  assert.equal(fieldProps.law.type, 'string');
  assert.equal(fieldProps.paragraph.type, 'number');

  assert.deepEqual(getEnumValues({ values: ['a', 'b'] }), ['a', 'b']);
  assert.deepEqual(getEnumValues({ values: [1, 'b'] }), ['b']);
  assert.deepEqual(getEnumValues(null), []);
});
