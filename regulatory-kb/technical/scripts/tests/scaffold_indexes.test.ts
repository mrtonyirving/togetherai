import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'node:path';
import test from 'node:test';

import {
  readConceptIndex,
  readEnforcementActionIndex,
  readJurisdictionIndex,
  writeConceptIndex
} from '../lib/scaffold/indexes.js';
import { withTempCwd, writeFixtureFile } from './test_fs.js';

test('readConceptIndex supports shorthand, linked, and legacy concept/subconcept formats', async () => {
  await withTempCwd('scaffold-indexes-concepts-', async (root) => {
    await writeFixtureFile(
      root,
      'library/taxonomy/index_concepts.md',
      `
# Concept Index

- Concept: [alpha]
  - Subconcept: [alpha_child]
- Concept: [beta](AML/concepts/beta/beta.md)
  - Subconcept: [beta_child](AML/concepts/beta/subconcepts/beta_child/beta_child.md)
- Concept: gamma | File: [AML/concepts/gamma/gamma.md](AML/concepts/gamma/gamma.md)
  - Subconcept: gamma_child | File: [AML/concepts/gamma/subconcepts/gamma_child/gamma_child.md](AML/concepts/gamma/subconcepts/gamma_child/gamma_child.md)
`
    );

    const concepts = await readConceptIndex();
    assert.deepEqual(concepts, [
      {
        name: 'alpha',
        file: 'AML/concepts/alpha/alpha.md',
        subconcepts: [
          {
            name: 'alpha_child',
            file: 'AML/concepts/alpha/subconcepts/alpha_child/alpha_child.md'
          }
        ]
      },
      {
        name: 'beta',
        file: 'AML/concepts/beta/beta.md',
        subconcepts: [
          {
            name: 'beta_child',
            file: 'AML/concepts/beta/subconcepts/beta_child/beta_child.md'
          }
        ]
      },
      {
        name: 'gamma',
        file: 'AML/concepts/gamma/gamma.md',
        subconcepts: [
          {
            name: 'gamma_child',
            file: 'AML/concepts/gamma/subconcepts/gamma_child/gamma_child.md'
          }
        ]
      }
    ]);
  });
});

test('readEnforcementActionIndex supports shorthand, linked, and legacy formats', async () => {
  await withTempCwd('scaffold-indexes-enforcement-', async (root) => {
    await writeFixtureFile(
      root,
      'library/taxonomy/index_enforcement_actions.md',
      `
# Enforcement Action Index

- Enforcement Action: [se_alpha]
- Enforcement Action: [se_beta](../ontologies/document-types/enforcement-actions/jurisdictions/se/examples/enforcement-actions/se_beta.md)
- Enforcement Action: se_gamma | File: [../ontologies/document-types/enforcement-actions/jurisdictions/se/examples/enforcement-actions/se_gamma.md](../ontologies/document-types/enforcement-actions/jurisdictions/se/examples/enforcement-actions/se_gamma.md)
`
    );

    const entries = await readEnforcementActionIndex();
    assert.deepEqual(entries, [
      {
        name: 'se_alpha',
        file: '../ontologies/document-types/enforcement-actions/jurisdictions/se/examples/enforcement-actions/se_alpha.md'
      },
      {
        name: 'se_beta',
        file: '../ontologies/document-types/enforcement-actions/jurisdictions/se/examples/enforcement-actions/se_beta.md'
      },
      {
        name: 'se_gamma',
        file: '../ontologies/document-types/enforcement-actions/jurisdictions/se/examples/enforcement-actions/se_gamma.md'
      }
    ]);
  });
});

test('readJurisdictionIndex parses linked and legacy entries with nested provision levels', async () => {
  await withTempCwd('scaffold-indexes-jurisdiction-', async (root) => {
    await writeFixtureFile(
      root,
      'library/taxonomy/index_jurisdiction.md',
      `
# Jurisdiction Index

- Jurisdiction: [Sweden](AML/map/Sweden/Sweden.md)
  - Law: Law A | File: AML/map/Sweden/legislation/Law A
    - Level_1: [Kapitel_1](AML/map/Sweden/legislation/Law A/Level_1/Kapitel_1/Kapitel_1.md)
      - Level_2: Paragraf_2 | File: AML/map/Sweden/legislation/Law A/Level_1/Kapitel_1/Level_2/Paragraf_2/Paragraf_2.md
`
    );

    const jurisdictions = await readJurisdictionIndex();
    assert.equal(jurisdictions.length, 1);
    assert.equal(jurisdictions[0].name, 'Sweden');
    assert.equal(jurisdictions[0].laws.length, 1);
    assert.equal(jurisdictions[0].laws[0].name, 'Law A');
    assert.equal(jurisdictions[0].laws[0].provisions[0].name, 'Kapitel_1');
    assert.equal(
      jurisdictions[0].laws[0].provisions[0].children[0].name,
      'Paragraf_2'
    );
  });
});

test('writeConceptIndex outputs sorted linked entries that can be read back', async () => {
  await withTempCwd('scaffold-indexes-write-read-', async (root) => {
    await writeFixtureFile(root, 'library/taxonomy/index_concepts.md', '# Concept Index\n');

    await writeConceptIndex([
      {
        name: 'beta',
        file: 'AML/concepts/beta/beta.md',
        subconcepts: [{ name: 'beta_z', file: 'AML/concepts/beta/subconcepts/beta_z/beta_z.md' }]
      },
      {
        name: 'alpha',
        file: 'AML/concepts/alpha/alpha.md',
        subconcepts: [{ name: 'alpha_a', file: 'AML/concepts/alpha/subconcepts/alpha_a/alpha_a.md' }]
      }
    ]);

    const filePath = path.join(root, 'library/taxonomy/index_concepts.md');
    const written = await fs.readFile(filePath, 'utf8');
    assert.match(written, /^- Concept: \[alpha\]/m);
    assert.match(written, /^- Concept: \[beta\]/m);

    const roundTrip = await readConceptIndex();
    assert.equal(roundTrip[0].name, 'alpha');
    assert.equal(roundTrip[1].name, 'beta');
  });
});
