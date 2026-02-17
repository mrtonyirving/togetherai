import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findJurisdictionCatalog,
  findLawCatalog,
  getParagraphNumbers,
  getPunktNumbers,
  getStyckeNumbers,
  loadScaffoldCatalog
} from '../lib/scaffold_catalog.js';
import { withTempCwd, writeFixtureFile } from './test_fs.js';

test('loadScaffoldCatalog merges Sweden laws from index and filesystem', async () => {
  await withTempCwd('scaffold-catalog-laws-', async (root) => {
    await writeFixtureFile(
      root,
      'library/taxonomy/index_jurisdiction.md',
      `
# Jurisdiction Index

- Jurisdiction: [Sweden](AML/map/Sweden/Sweden.md)
  - Law: [Lag (2017:630) om atgarder mot penningtvatt](AML/map/Sweden/legislation/Lag (2017:630) om atgarder mot penningtvatt)
    - Level_1: [Kapitel_1](AML/map/Sweden/legislation/Lag (2017:630) om atgarder mot penningtvatt/Level_1/Kapitel_1/Kapitel_1.md)
      - Level_2: [Paragraf_2](AML/map/Sweden/legislation/Lag (2017:630) om atgarder mot penningtvatt/Level_1/Kapitel_1/Level_2/Paragraf_2/Paragraf_2.md)
        - Level_3: [Stycke_3](AML/map/Sweden/legislation/Lag (2017:630) om atgarder mot penningtvatt/Level_1/Kapitel_1/Level_2/Paragraf_2/Level_3/Stycke_3/Stycke_3.md)
          - Level_4: [Punkt_4](AML/map/Sweden/legislation/Lag (2017:630) om atgarder mot penningtvatt/Level_1/Kapitel_1/Level_2/Paragraf_2/Level_3/Stycke_3/Level_4/Punkt_4/Punkt_4.md)
`
    );

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/map/Sweden/legislation/2024:100/Level_1/Kapitel_7/Kapitel_7.md',
      `
# Kapitel_7
`
    );

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/map/Sweden/legislation/Lag (2017:630) om atgarder mot penningtvatt/Level_1/Kapitel_5/Kapitel_5.md',
      `
# Kapitel_5
`
    );

    const catalog = await loadScaffoldCatalog();
    const sweden = findJurisdictionCatalog(catalog, 'Sweden');
    assert.ok(sweden, 'Expected Sweden jurisdiction catalog to exist');

    const lawNames = sweden.laws.map((entry) => entry.name);
    assert.deepEqual(lawNames, ['2024:100', 'Lag (2017:630) om atgarder mot penningtvatt']);

    const indexedLaw = findLawCatalog(sweden, 'Lag (2017:630) om atgarder mot penningtvatt');
    assert.ok(indexedLaw, 'Expected indexed law to be present');
    assert.deepEqual(indexedLaw.lawCodeCandidates, ['2017:630']);
    assert.deepEqual(indexedLaw.chapterNumbers, [1, 5]);
    assert.deepEqual(getParagraphNumbers(indexedLaw, 1), [2]);
    assert.deepEqual(getStyckeNumbers(indexedLaw, 1, 2), [3]);
    assert.deepEqual(getPunktNumbers(indexedLaw, 1, 2, 3), [4]);
  });
});

test('loadScaffoldCatalog merges concept and enforcement slugs from index and filesystem', async () => {
  await withTempCwd('scaffold-catalog-slugs-', async (root) => {
    await writeFixtureFile(
      root,
      'library/taxonomy/index_concepts.md',
      `
# Concept Index

- Concept: [risk_assessment](AML/concepts/risk_assessment/risk_assessment.md)
`
    );

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/custom_concept/custom_concept.md',
      `
# Custom_Concept
`
    );

    await writeFixtureFile(
      root,
      'library/taxonomy/index_enforcement_actions.md',
      `
# Enforcement Action Index

- Enforcement Action: [se-index-action](../ontologies/document-types/enforcement-actions/jurisdictions/se/examples/enforcement-actions/se-index-action.md)
`
    );

    await writeFixtureFile(
      root,
      'library/ontologies/document-types/enforcement-actions/jurisdictions/se/examples/enforcement-actions/se-file-action.md',
      `
# Sweden Enforcement Action se-file-action
`
    );

    const catalog = await loadScaffoldCatalog();
    assert.deepEqual(catalog.conceptSlugs, ['custom_concept', 'risk_assessment']);
    assert.deepEqual(catalog.enforcementActionSlugs, ['se-file-action', 'se-index-action']);
  });
});

test('loadScaffoldCatalog ingests Sweden reference mentions into law options', async () => {
  await withTempCwd('scaffold-catalog-reference-mentions-', async (root) => {
    await writeFixtureFile(
      root,
      'library/taxonomy/index_jurisdiction.md',
      `
# Jurisdiction Index

- Jurisdiction: [Sweden](AML/map/Sweden/Sweden.md)
  - Law: [2017:630](AML/map/Sweden/legislation/2017:630)
    - Level_1: [Kapitel_1](AML/map/Sweden/legislation/2017:630/Level_1/Kapitel_1/Kapitel_1.md)
`
    );

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/map/Sweden/legislation/2017:630/Level_1/Kapitel_1/Kapitel_1.md',
      `
# Kapitel_1
`
    );

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/risk/risk.md',
      `
# Risk

## metadata
- concept_id: Risk
- concept_slug: risk

## references
- SE,RD,2017:630,k1,p1,s1,pt1
- SE,RD,2017:630,k3,p3
`
    );

    const catalog = await loadScaffoldCatalog();
    const sweden = findJurisdictionCatalog(catalog, 'Sweden');
    assert.ok(sweden, 'Expected Sweden jurisdiction catalog to exist');

    const law = findLawCatalog(sweden, '2017:630');
    assert.ok(law, 'Expected 2017:630 law catalog to exist');
    assert.deepEqual(law.chapterNumbers, [1, 3]);
    assert.deepEqual(getParagraphNumbers(law, 1), [1]);
    assert.deepEqual(getStyckeNumbers(law, 1, 1), [1]);
    assert.deepEqual(getPunktNumbers(law, 1, 1, 1), [1]);
    assert.deepEqual(getParagraphNumbers(law, 3), [3]);
  });
});
