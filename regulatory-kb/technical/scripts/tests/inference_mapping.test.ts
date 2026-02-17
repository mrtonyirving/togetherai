import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  loadInferenceMappingModel,
  parseConceptReferencesSection
} from '../lib/inference_mapping.js';
import { formatReferenceBlocksFromAddresses } from '../lib/reference_contract.js';
import { withTempCwd, writeFixtureFile } from './test_fs.js';

const SAMPLE_FILE = '/tmp/concept.md';
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '../../..');
const TSX_IMPORT = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');

function strictReferenceSection(addresses: string[]): string {
  return formatReferenceBlocksFromAddresses(addresses).join('\n');
}

async function seedReferenceTemplates(root: string): Promise<void> {
  const pairs = [
    [
      path.join(
        REPO_ROOT,
        'library/ontologies/document-types/legislation/jurisdictions/Sweden/law.json'
      ),
      path.join(
        root,
        'library/ontologies/document-types/legislation/jurisdictions/Sweden/law.json'
      )
    ],
    [
      path.join(
        REPO_ROOT,
        'library/ontologies/document-types/legislation/jurisdictions/EU/law.json'
      ),
      path.join(
        root,
        'library/ontologies/document-types/legislation/jurisdictions/EU/law.json'
      )
    ]
  ] as const;

  for (const [from, to] of pairs) {
    await fs.ensureDir(path.dirname(to));
    await fs.copyFile(from, to);
  }
}

test('parseConceptReferencesSection parses strict ref blocks and de-duplicates addresses', () => {
  const section = [
    ...formatReferenceBlocksFromAddresses([
      'SE,RD,2017:630,k1,p1',
      'EU,RD,Directive (EU) 2015-849,ch1,sec2,art3,ahscope-and-definitions,par4,sub5,pta,indii'
    ]),
    '### ref_3',
    '',
    '- jurisdiction: SE',
    '- entity: RD',
    '- law: 2017:630',
    '- level: 2',
    '- level_label: Paragraf',
    '- chapter: 1',
    '- paragraph: 1',
    '- address: SE,RD,2017:630,k1,p1',
    ''
  ].join('\n');

  assert.deepEqual(parseConceptReferencesSection(section, SAMPLE_FILE), [
    'EU,RD,Directive (EU) 2015-849,ch1,sec2,art3,ahscope-and-definitions,par4,sub5,pta,indii',
    'SE,RD,2017:630,k1,p1'
  ]);
});

test('parseConceptReferencesSection rejects legacy canonical bullet format', () => {
  const section = `
- SE,RD,2017:630,k1,p1
- SE,RD,2017:630,k1,p1,s1
`;

  assert.throws(
    () => parseConceptReferencesSection(section, SAMPLE_FILE),
    /must contain at least one '###' subsection/
  );
});

test('parseConceptReferencesSection rejects legacy structured concept blocks', () => {
  const section = `
Sweden:
Law: 2017:630
Kapitel: 1
Paragraph: p1
`;

  assert.throws(
    () => parseConceptReferencesSection(section, SAMPLE_FILE),
    /must contain at least one '###' subsection/
  );
});

test('parseConceptReferencesSection enforces strict Sweden metadata hierarchy', () => {
  const section = `
### ref_1

- jurisdiction: SE
- entity: RD
- law: 2017:630
- level: 4
- level_label: Punkt
- chapter: 1
- paragraph: 1
- punkt: 1
- address: SE,RD,2017:630,k1,p1,pt1
`;

  assert.throws(
    () => parseConceptReferencesSection(section, SAMPLE_FILE),
    /stycke is required for level=4/
  );
});

test('parseConceptReferencesSection enforces strict EU metadata hierarchy', () => {
  const section = `
### ref_1

- jurisdiction: EU
- entity: RD
- citation: Directive (EU) 2015-849
- level: 4
- level_label: Paragraph
- paragraph: 1
- address: EU,RD,Directive (EU) 2015-849,par1
`;

  assert.throws(
    () => parseConceptReferencesSection(section, SAMPLE_FILE),
    /paragraph requires article/
  );
});

test('loadInferenceMappingModel supports strict concept references', async () => {
  await withTempCwd('inference-mapping-valid-', async (root) => {
    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/root_concept/root_concept.md',
      `
# root_concept

## metadata
- concept_id: root_concept
- concept_slug: root_concept
- kind: concept

## references
${strictReferenceSection([
  'SE,RD,2017:630,k1,p1',
  'SE,RD,2017:630,k1,p1,s1'
])}

## subconcepts
- child_concept
`
    );

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/root_concept/subconcepts/child_concept/child_concept.md',
      `
# child_concept

## metadata
- concept_id: child_concept
- concept_slug: child_concept
- kind: subconcept
- parent_concept_id: root_concept

## references
${strictReferenceSection(['SE,RD,2017:630,k1,p1,s1,pt1'])}
`
    );

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/map/Sweden/legislation/Test Law/Level_1/Kapitel_1/Level_2/Paragraf_1/Paragraf_1.md',
      `
# Paragraf_1

## metadata
- jurisdiction: SE
- entity: RD
- law: 2017:630
- level: 2
- level_label: Paragraf
- chapter: 1
- paragraph: 1
- address: SE,RD,2017:630,k1,p1

## topics
- root_concept
`
    );

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/map/Sweden/legislation/Test Law/Level_1/Kapitel_1/Level_2/Paragraf_1/Level_3/Stycke_1/Stycke_1.md',
      `
# Stycke_1

## metadata
- jurisdiction: SE
- entity: RD
- law: 2017:630
- level: 3
- level_label: Stycke
- chapter: 1
- paragraph: 1
- stycke: 1
- address: SE,RD,2017:630,k1,p1,s1

## topics
- root_concept
`
    );

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/map/Sweden/legislation/Test Law/Level_1/Kapitel_1/Level_2/Paragraf_1/Level_3/Stycke_1/Level_4/Punkt_1/Punkt_1.md',
      `
# Punkt_1

## metadata
- jurisdiction: SE
- entity: RD
- law: 2017:630
- level: 4
- level_label: Punkt
- chapter: 1
- paragraph: 1
- stycke: 1
- punkt: 1
- address: SE,RD,2017:630,k1,p1,s1,pt1

## topics
- child_concept
`
    );

    const model = await loadInferenceMappingModel();

    assert.equal(model.concepts.length, 2);
    assert.equal(model.provisions.length, 3);
    assert.equal(model.enforcementActions.length, 0);

    const rootTopic = model.relations.topicMappings.find((row) => row.topic === 'root_concept');
    assert.ok(rootTopic);
    assert.deepEqual(rootTopic.addresses, [
      'SE,RD,2017:630,k1,p1',
      'SE,RD,2017:630,k1,p1,s1'
    ]);

    const childTopic = model.relations.topicMappings.find((row) => row.topic === 'child_concept');
    assert.ok(childTopic);
    assert.deepEqual(childTopic.addresses, ['SE,RD,2017:630,k1,p1,s1,pt1']);

    assert.deepEqual(model.relations.isSubtopics, [
      { subtopic: 'child_concept', parentTopic: 'root_concept' }
    ]);
  });
});

test('loadInferenceMappingModel rejects mixed strict + legacy reference lines in one section', async () => {
  await withTempCwd('inference-mapping-mixed-', async (root) => {
    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/mixed_style/mixed_style.md',
      `
# mixed_style

## metadata
- concept_id: mixed_style
- concept_slug: mixed_style
- kind: concept

## references
### ref_1

- jurisdiction: SE
- entity: RD
- law: 2017:630
- level: 2
- level_label: Paragraf
- chapter: 1
- paragraph: 1
- address: SE,RD,2017:630,k1,p1

- SE,RD,2017:630,k1,p1,s1
`
    );

    await assert.rejects(loadInferenceMappingModel(), /unsupported key 'se_rd_2017'/);
  });
});

test('loadInferenceMappingModel rejects legacy SE enforcement minimal statutory references', async () => {
  await withTempCwd('inference-mapping-legacy-enforcement-minimal-', async (root) => {
    await writeFixtureFile(
      root,
      'library/ontologies/document-types/enforcement-actions/jurisdictions/se/examples/enforcement-actions/legacy-minimal.md',
      `
# Legacy Minimal

## record
- reference_id: SE,FI,SB,23-13249
- diarienummer: 23-13249
- regulatory_authority: Finansinspektionen
- affected_entity_name: Example Bank AB
- entity_type: bank
- decision_type: warning
- fine: no

## statutory_references

### ref_1

- law: 2017:630
- chapter: 1
- paragraph: 1
- address: SE,RD,2017:630,k1,p1
`
    );

    await assert.rejects(
      loadInferenceMappingModel(),
      /missing required key 'jurisdiction'/
    );
  });
});

test('loadInferenceMappingModel reports missing provision mappings for strict references', async () => {
  await withTempCwd('inference-mapping-missing-provision-', async (root) => {
    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/solo_concept/solo_concept.md',
      `
# solo_concept

## metadata
- concept_id: solo_concept
- concept_slug: solo_concept
- kind: concept

## references
${strictReferenceSection(['SE,RD,2017:630,k1,p1'])}
`
    );

    await assert.rejects(
      loadInferenceMappingModel(),
      /Missing in provision docs \(1\):[\s\S]*solo_concept::SE,RD,2017:630,k1,p1/
    );
  });
});

test('loadInferenceMappingModel deduplicates normalized references from strict blocks', async () => {
  await withTempCwd('inference-mapping-dedupe-', async (root) => {
    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/dedupe_concept/dedupe_concept.md',
      `
# dedupe_concept

## metadata
- concept_id: dedupe_concept
- concept_slug: dedupe_concept
- kind: concept

## references
### ref_1

- jurisdiction: SE
- entity: RD
- law: 2017:630
- level: 2
- level_label: Paragraf
- chapter: 1
- paragraph: 1
- address: SE,RD,2017:630,k1,p1

### ref_2

- jurisdiction: SE
- entity: RD
- law: 2017:630
- level: 2
- level_label: Paragraf
- chapter: 1
- paragraph: 1
- address: SE,RD,2017:630,k1,p1
`
    );

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/map/Sweden/legislation/Test Law/Level_1/Kapitel_1/Level_2/Paragraf_1/Paragraf_1.md',
      `
# Paragraf_1

## metadata
- jurisdiction: SE
- entity: RD
- law: 2017:630
- level: 2
- level_label: Paragraf
- chapter: 1
- paragraph: 1
- address: SE,RD,2017:630,k1,p1

## topics
- dedupe_concept
`
    );

    const model = await loadInferenceMappingModel();
    const dedupeTopic = model.relations.topicMappings.find((row) => row.topic === 'dedupe_concept');
    assert.ok(dedupeTopic);
    assert.deepEqual(dedupeTopic.addresses, ['SE,RD,2017:630,k1,p1']);
  });
});

test('loadInferenceMappingModel supports EU references across concepts and provision docs', async () => {
  await withTempCwd('inference-mapping-eu-valid-', async (root) => {
    const euAddress =
      'EU,RD,Directive (EU) 2015-849,ch1,sec2,art3,ahscope-and-definitions,par4,sub5,pta,indii';

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/eu_test_concept/eu_test_concept.md',
      `
# eu_test_concept

## metadata
- concept_id: eu_test_concept
- concept_slug: eu_test_concept
- kind: concept

## references
${strictReferenceSection([euAddress])}
`
    );

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/map/EU/legislation/Directive (EU) 2015-849/Level_1/Chapter_1/Level_2/Section_2/Level_3/Article_3/Level_4/Paragraph_4/Paragraph_4.md',
      `
# Paragraph_4

## metadata
- jurisdiction: EU
- entity: RD
- citation: Directive (EU) 2015-849
- level: 7
- level_label: Indent
- chapter: 1
- section: 2
- article: 3
- article_heading: Scope and Definitions
- paragraph: 4
- subparagraph: 5
- point: a
- indent: ii
- address: ${euAddress}

## topics
- eu_test_concept
`
    );

    const model = await loadInferenceMappingModel();
    const topic = model.relations.topicMappings.find((row) => row.topic === 'eu_test_concept');
    assert.ok(topic);
    assert.deepEqual(topic.addresses, [euAddress]);
    assert.equal(model.provisions.length, 1);
    assert.equal(model.provisions[0].address, euAddress);
  });
});

test('loadInferenceMappingModel rejects EU provision metadata that does not match address components', async () => {
  await withTempCwd('inference-mapping-eu-mismatch-', async (root) => {
    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/eu_mismatch/eu_mismatch.md',
      `
# eu_mismatch

## metadata
- concept_id: eu_mismatch
- concept_slug: eu_mismatch
- kind: concept

## references
${strictReferenceSection(['EU,RD,Directive (EU) 2015-849,ch1,sec1,art1'])}
`
    );

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/map/EU/legislation/Directive (EU) 2015-849/Level_1/Chapter_1/Chapter_1.md',
      `
# Chapter_1

## metadata
- jurisdiction: EU
- entity: RD
- citation: Directive (EU) 2018-843
- level: 1
- level_label: Chapter
- chapter: 1
- address: EU,RD,Directive (EU) 2015-849,ch1

## topics
- eu_mismatch
`
    );

    await assert.rejects(
      loadInferenceMappingModel(),
      /does not match metadata components/
    );
  });
});

test('loadInferenceMappingModel allows scaffolded concepts with empty references', async () => {
  await withTempCwd('inference-mapping-empty-references-', async (root) => {
    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/empty_references/empty_references.md',
      `
# empty_references

## metadata
- concept_id: empty_references
- concept_slug: empty_references
- kind: concept

## references
`
    );

    const model = await loadInferenceMappingModel();
    const concept = model.concepts.find((entry) => entry.conceptId === 'empty_references');
    assert.ok(concept);
    assert.deepEqual(concept.references, []);

    const topic = model.relations.topicMappings.find((row) => row.topic === 'empty_references');
    assert.ok(topic);
    assert.deepEqual(topic.addresses, []);
  });
});

test('loadInferenceMappingModel normalizes mixed-case concept metadata and provision topics', async () => {
  await withTempCwd('inference-mapping-normalization-', async (root) => {
    const address = 'SE,RD,2017:630,k1,p1';

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/general_risk_assessment/general_risk_assessment.md',
      `
# General Risk Assessment

## metadata
- concept_id: General Risk Assessment
- concept_slug: General-Risk Assessment
- kind: concept

## references
${strictReferenceSection([address])}
`
    );

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/map/Sweden/legislation/Test Law/Level_1/Kapitel_1/Level_2/Paragraf_1/Paragraf_1.md',
      `
# Paragraf_1

## metadata
- jurisdiction: SE
- entity: RD
- law: 2017:630
- level: 2
- level_label: Paragraf
- chapter: 1
- paragraph: 1
- address: ${address}

## topics
- GENERAL risk Assessment
`
    );

    const model = await loadInferenceMappingModel();
    assert.equal(model.concepts.length, 1);
    assert.equal(model.concepts[0].conceptId, 'general_risk_assessment');
    assert.equal(model.concepts[0].conceptSlug, 'general_risk_assessment');
    assert.deepEqual(model.relations.topicMappings, [
      {
        topic: 'general_risk_assessment',
        addresses: [address]
      }
    ]);
  });
});

test('loadInferenceMappingModel auto-merges normalized concept_id collisions and unions subconcepts', async () => {
  await withTempCwd('inference-mapping-collision-merge-', async (root) => {
    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/risk_topic_a/risk_topic_a.md',
      `
# Risk Topic

## metadata
- concept_id: Risk Topic
- concept_slug: Risk Topic
- kind: concept

## references

## subconcepts
- Child A
`
    );

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/risk_topic_b/risk_topic_b.md',
      `
# risk-topic

## metadata
- concept_id: risk-topic
- concept_slug: risk_topic
- kind: concept

## references

## subconcepts
- child-b
`
    );

    const model = await loadInferenceMappingModel();
    assert.equal(model.concepts.length, 1);
    assert.equal(model.concepts[0].conceptId, 'risk_topic');
    assert.deepEqual(model.concepts[0].subconcepts, ['child_a', 'child_b']);
    assert.deepEqual(model.relations.isSubtopics, [
      { subtopic: 'child_a', parentTopic: 'risk_topic' },
      { subtopic: 'child_b', parentTopic: 'risk_topic' }
    ]);
  });
});

test('loadInferenceMappingModel rejects normalized concept_id collisions with conflicting kind', async () => {
  await withTempCwd('inference-mapping-collision-kind-', async (root) => {
    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/risk_topic/risk_topic.md',
      `
# Risk Topic

## metadata
- concept_id: Risk Topic
- concept_slug: risk_topic
- kind: concept

## references
`
    );

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/parent/subconcepts/risk_topic/risk_topic.md',
      `
# risk_topic

## metadata
- concept_id: risk_topic
- concept_slug: risk_topic
- kind: subconcept
- parent_concept_id: parent

## references
`
    );

    await assert.rejects(
      loadInferenceMappingModel(),
      /conflicting metadata\.kind for normalized concept_id 'risk_topic'/
    );
  });
});

test('loadInferenceMappingModel rejects normalized concept_id collisions with conflicting parent_concept_id', async () => {
  await withTempCwd('inference-mapping-collision-parent-', async (root) => {
    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/parent_one/subconcepts/risk_child/risk_child.md',
      `
# Risk Child

## metadata
- concept_id: Risk Child
- concept_slug: risk_child
- kind: subconcept
- parent_concept_id: Parent One

## references
`
    );

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/parent_two/subconcepts/risk-child/risk-child.md',
      `
# risk-child

## metadata
- concept_id: risk-child
- concept_slug: risk_child
- kind: subconcept
- parent_concept_id: Parent Two

## references
`
    );

    await assert.rejects(
      loadInferenceMappingModel(),
      /conflicting normalized metadata\.parent_concept_id for normalized concept_id 'risk_child'/
    );
  });
});

test('loadInferenceMappingModel rejects normalized concept_id collisions with conflicting slug identity', async () => {
  await withTempCwd('inference-mapping-collision-slug-', async (root) => {
    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/risk_topic/risk_topic.md',
      `
# Risk Topic

## metadata
- concept_id: Risk Topic
- concept_slug: risk_topic
- kind: concept

## references
`
    );

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/risk_topic_variant/risk_topic_variant.md',
      `
# risk topic

## metadata
- concept_id: risk-topic
- concept_slug: risk_subject
- kind: concept

## references
`
    );

    await assert.rejects(
      loadInferenceMappingModel(),
      /conflicting normalized metadata\.concept_slug for normalized concept_id 'risk_topic'/
    );
  });
});

test('provision metadata maps to SE,RD,2017:630,k1,p2,s3,pt3 and is emitted to generated relations + cypher', async () => {
  await withTempCwd('inference-mapping-address-flow-', async (root) => {
    const expectedAddress = 'SE,RD,2017:630,k1,p2,s3,pt3';
    await seedReferenceTemplates(root);

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/sample_topic/sample_topic.md',
      `
# sample_topic

## metadata
- concept_id: sample_topic
- concept_slug: sample_topic
- kind: concept

## references
${strictReferenceSection([expectedAddress])}
`
    );

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/map/Sweden/legislation/2017:630/Level_1/Kapitel_1/Level_2/Paragraf_2/Level_3/Stycke_3/Level_4/Punkt_3/Punkt_3.md',
      `
# Punkt_3

## metadata
- jurisdiction: SE
- entity: RD
- law: 2017:630
- level: 4
- level_label: Punkt
- chapter: 1
- paragraph: 2
- stycke: 3
- punkt: 3
- address: ${expectedAddress}

## topics
- sample_topic
`
    );

    const model = await loadInferenceMappingModel();

    assert.equal(model.provisions.length, 1);
    assert.equal(model.provisions[0].address, expectedAddress);
    assert.deepEqual(model.provisions[0].metadata, {
      jurisdiction: 'SE',
      entity: 'RD',
      law: '2017:630',
      level: '4',
      level_label: 'Punkt',
      chapter: '1',
      paragraph: '2',
      stycke: '3',
      punkt: '3',
      address: expectedAddress
    });

    assert.deepEqual(model.relations.topicMappings, [
      {
        topic: 'sample_topic',
        addresses: [expectedAddress]
      }
    ]);

    const generateRelationsScript = path.join(REPO_ROOT, 'technical/scripts/generate_inference_relations.ts');
    const generateCypherScript = path.join(REPO_ROOT, 'technical/scripts/generate_cypher.ts');

    const relationsResult = spawnSync(
      process.execPath,
      ['--import', TSX_IMPORT, generateRelationsScript],
      {
        cwd: root,
        encoding: 'utf8'
      }
    );
    assert.equal(relationsResult.status, 0, relationsResult.stderr || relationsResult.stdout);

    const cypherResult = spawnSync(
      process.execPath,
      ['--import', TSX_IMPORT, generateCypherScript],
      {
        cwd: root,
        encoding: 'utf8'
      }
    );
    assert.equal(cypherResult.status, 0, cypherResult.stderr || cypherResult.stdout);

    const relationsFile = await fs.readFile(
      path.join(root, 'library/taxonomy/generated/relations.generated.ts'),
      'utf8'
    );
    assert.match(relationsFile, /"topic": "sample_topic"/);
    assert.match(relationsFile, /"SE,RD,2017:630,k1,p2,s3,pt3"/);

    const cypherFile = await fs.readFile(path.join(root, 'library/taxonomy/generated/inference.cypher'), 'utf8');
    assert.match(
      cypherFile,
      /MERGE p=\(r:Reference \{address: "SE,RD,2017:630,k1,p2,s3,pt3"\}\)-\[:HAS_TOPIC\]->\(t:Topic \{concept: "sample_topic"\}\) RETURN p;/
    );
  });
});
