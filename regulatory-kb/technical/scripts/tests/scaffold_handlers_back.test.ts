import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'node:path';
import test from 'node:test';

import {
  type CheckboxChoice,
  type PromptAdapter,
  type SelectChoice
} from '../lib/cli_prompts.js';
import {
  scaffoldConcept,
  scaffoldEnforcementAction,
  scaffoldProvision
} from '../lib/scaffold/handlers.js';
import type { ScaffoldCatalog } from '../lib/scaffold_catalog.js';
import { withTempCwd, writeFixtureFile } from './test_fs.js';

type Step<TConfig, TValue> = TValue | ((config: TConfig) => TValue);
type SelectConfig = {
  message: string;
  choices: Array<SelectChoice<unknown>>;
  defaultValue?: unknown;
};

function pickChoiceByName(config: SelectConfig, name: string): unknown {
  return config.choices.find((choice) => choice.name === name)?.value ?? config.choices[0].value;
}

function pickCheckboxValuesByName(
  config: { message: string; choices: Array<CheckboxChoice<unknown>> },
  names: string[]
): unknown[] {
  return names
    .map((name) => config.choices.find((choice) => choice.name === name)?.value)
    .filter((value): value is unknown => value !== undefined);
}

class MockPromptAdapter implements PromptAdapter {
  private readonly selectQueue: Array<Step<SelectConfig, unknown>>;
  private readonly confirmQueue: Array<Step<{ message: string; defaultValue?: boolean }, boolean>>;
  private readonly inputQueue: Array<Step<{ message: string; defaultValue?: string }, string>>;
  private readonly checkboxQueue: Array<
    Step<{ message: string; choices: Array<CheckboxChoice<unknown>> }, unknown[]>
  >;

  constructor(options: {
    select?: Array<Step<SelectConfig, unknown>>;
    confirm?: Array<Step<{ message: string; defaultValue?: boolean }, boolean>>;
    input?: Array<Step<{ message: string; defaultValue?: string }, string>>;
    checkbox?: Array<Step<{ message: string; choices: Array<CheckboxChoice<unknown>> }, unknown[]>>;
  } = {}) {
    this.selectQueue = options.select ?? [];
    this.confirmQueue = options.confirm ?? [];
    this.inputQueue = options.input ?? [];
    this.checkboxQueue = options.checkbox ?? [];
  }

  async select<T>(options: {
    message: string;
    choices: Array<SelectChoice<T>>;
    pageSize?: number;
    defaultValue?: T;
  }): Promise<T> {
    return this.takeStep(this.selectQueue, 'select', {
      message: options.message,
      choices: options.choices as Array<SelectChoice<unknown>>,
      defaultValue: options.defaultValue
    }) as T;
  }

  async confirm(options: { message: string; defaultValue?: boolean }): Promise<boolean> {
    return this.takeStep(this.confirmQueue, 'confirm', options);
  }

  async input(options: { message: string; defaultValue?: string }): Promise<string> {
    return this.takeStep(this.inputQueue, 'input', options);
  }

  async checkbox<T>(options: {
    message: string;
    choices: Array<CheckboxChoice<T>>;
    pageSize?: number;
  }): Promise<T[]> {
    return this.takeStep(
      this.checkboxQueue,
      'checkbox',
      {
        message: options.message,
        choices: options.choices as Array<CheckboxChoice<unknown>>
      }
    ) as T[];
  }

  private takeStep<TConfig, TValue>(
    queue: Array<Step<TConfig, TValue>>,
    method: string,
    config: TConfig
  ): TValue {
    const step = queue.shift();
    if (step === undefined) {
      throw new Error(`No mocked response left for ${method}`);
    }
    return typeof step === 'function' ? (step as (value: TConfig) => TValue)(config) : step;
  }
}

function sampleCatalog(): ScaffoldCatalog {
  return {
    conceptSlugs: ['general_risk_assessment', 'alpha', 'beta'],
    enforcementActionSlugs: [],
    jurisdictions: [
      {
        name: 'Sweden',
        laws: [
          {
            name: '2017:630',
            lawCodeCandidates: ['2017:630'],
            chapterNumbers: [1],
            paragraphNumbersByChapter: { '1': [1] },
            styckeNumbersByChapterParagraph: { '1:1': [1] },
            punktNumbersByChapterParagraphStycke: { '1:1:1': [1, 2] }
          }
        ]
      }
    ]
  };
}

async function seedCommonFixtures(root: string): Promise<void> {
  await writeFixtureFile(root, 'library/taxonomy/index_concepts.md', '# Concept Index');
  await writeFixtureFile(root, 'library/taxonomy/index_jurisdiction.md', '# Jurisdiction Index');
  await writeFixtureFile(
    root,
    'library/taxonomy/index_enforcement_actions.md',
    '# Enforcement Action Index'
  );

  await writeFixtureFile(
    root,
    'library/taxonomy/AML/concepts/general_risk_assessment/general_risk_assessment.md',
    `
# general_risk_assessment
`
  );

  await writeFixtureFile(
    root,
    'library/taxonomy/index_concepts.md',
    `
# Concept Index

- Concept: [general_risk_assessment](AML/concepts/general_risk_assessment/general_risk_assessment.md)
`
  );
}

test('scaffoldConcept supports back from references to parent custom input', async () => {
  await withTempCwd('scaffold-handlers-back-concept-', async (root) => {
    await seedCommonFixtures(root);

    const prompt = new MockPromptAdapter({
      select: [
        (config: SelectConfig) => pickChoiceByName(config, 'Custom concept slug...'),
        (config: SelectConfig) => pickChoiceByName(config, 'Custom parent...'),
        (config: SelectConfig) => pickChoiceByName(config, 'Back'),
        (config: SelectConfig) => pickChoiceByName(config, 'No')
      ],
      input: ['new_concept', 'parent_a', 'parent_b']
    });

    await scaffoldConcept(prompt, sampleCatalog());

    const conceptPath = path.join(
      root,
      'library/taxonomy/AML/concepts/parent_b/subconcepts/new_concept/new_concept.md'
    );
    assert.equal(await fs.pathExists(conceptPath), true);

    const conceptIndex = await fs.readFile(
      path.join(root, 'library/taxonomy/index_concepts.md'),
      'utf8'
    );
    assert.match(conceptIndex, /Concept: \[parent_b\]/);
    assert.match(conceptIndex, /Subconcept: \[new_concept\]/);
    assert.doesNotMatch(conceptIndex, /Concept: \[parent_a\]/);
  });
});

test('scaffoldConcept rejects existing concept files that use legacy reference formats', async () => {
  await withTempCwd('scaffold-handlers-merge-refs-', async (root) => {
    await seedCommonFixtures(root);

    // Pre-create a concept file with old bullet-format references
    const conceptDir = path.join(root, 'library/taxonomy/AML/concepts/alpha');
    await fs.ensureDir(conceptDir);
    await fs.writeFile(
      path.join(conceptDir, 'alpha.md'),
      [
        '# Alpha',
        '',
        '## metadata',
        '- concept_id: Alpha',
        '- concept_slug: alpha',
        '- kind: concept',
        '',
        '## references',
        '- SE,RD,2017:630,k1,p1',
        '',
        '## subconcepts',
        '',
        '- Alpha_Sub',
        ''
      ].join('\n'),
      'utf8'
    );

    // Scaffold the same concept with a new chapter-only reference (k2, no paragraph)
    const catalog = sampleCatalog();
    catalog.jurisdictions[0].laws[0].chapterNumbers = [1, 2];

    const prompt = new MockPromptAdapter({
      select: [
        // 'Concept slug' → pick 'alpha'
        (config: SelectConfig) => pickChoiceByName(config, 'alpha'),
        // 'Parent concept slug' → None
        (config: SelectConfig) => pickChoiceByName(config, 'None'),
        // 'Add statutory reference now?' → Yes
        true,
        // Jurisdiction → SE
        'SE',
        // Law → 2017:630
        (config: SelectConfig) => pickChoiceByName(config, '2017:630'),
        // Law number → 2017:630
        (config: SelectConfig) => pickChoiceByName(config, '2017:630'),
        // Chapter → 2
        (config: SelectConfig) => pickChoiceByName(config, '2'),
        // Paragraph → Skip
        (config: SelectConfig) => pickChoiceByName(config, 'Skip'),
        // Add another reference? → No
        false
      ]
    });

    await assert.rejects(
      scaffoldConcept(prompt, catalog),
      /section 'references' must use '### ref_N' metadata blocks/
    );
  });
});

test('scaffoldProvision supports back through topics and custom topics', async () => {
  await withTempCwd('scaffold-handlers-back-provision-', async (root) => {
    await seedCommonFixtures(root);

    const prompt = new MockPromptAdapter({
      select: [
        (config: SelectConfig) => pickChoiceByName(config, '2017:630'),
        (config: SelectConfig) => pickChoiceByName(config, '2017:630'),
        (config: SelectConfig) => pickChoiceByName(config, '1'),
        (config: SelectConfig) => pickChoiceByName(config, '1'),
        (config: SelectConfig) => pickChoiceByName(config, '1'),
        (config: SelectConfig) => pickChoiceByName(config, '1'),
        (config: SelectConfig) => pickChoiceByName(config, '2')
      ],
      checkbox: [
        (config: { message: string; choices: Array<CheckboxChoice<unknown>> }) =>
          pickCheckboxValuesByName(config, ['Back']),
        (config: { message: string; choices: Array<CheckboxChoice<unknown>> }) =>
          pickCheckboxValuesByName(config, ['general_risk_assessment']),
        (config: { message: string; choices: Array<CheckboxChoice<unknown>> }) =>
          pickCheckboxValuesByName(config, ['general_risk_assessment'])
      ],
      input: ['/back', 'Custom_concept']
    });

    await scaffoldProvision(prompt, sampleCatalog());

    const provisionPath = path.join(
      root,
      'library/taxonomy/AML/map/Sweden/legislation/2017:630/Level_1/Kapitel_1/Level_2/Paragraf_1/Level_3/Stycke_1/Level_4/Punkt_2/Punkt_2.md'
    );
    const provision = await fs.readFile(provisionPath, 'utf8');
    assert.match(provision, /- punkt: 2/);
    assert.match(provision, /- custom_concept/);
    assert.match(provision, /- general_risk_assessment/);
  });
});

test('scaffoldEnforcementAction supports back across fine branch and concepts', async () => {
  await withTempCwd('scaffold-handlers-back-enforcement-', async (root) => {
    await seedCommonFixtures(root);

    const prompt = new MockPromptAdapter({
      input: [
        'svea_back',
        'Sweden',
        '23-10000',
        'Entity AB',
        'credit_institution',
        '100',
        '/back',
        '/back'
      ],
      select: [
        (config: SelectConfig) => pickChoiceByName(config, 'warning'),
        (config: SelectConfig) => pickChoiceByName(config, 'yes'),
        (config: SelectConfig) => pickChoiceByName(config, 'no'),
        (config: SelectConfig) => pickChoiceByName(config, 'Back'),
        (config: SelectConfig) => pickChoiceByName(config, 'no'),
        (config: SelectConfig) => pickChoiceByName(config, 'No'),
        (config: SelectConfig) => pickChoiceByName(config, 'No')
      ]
    });

    await scaffoldEnforcementAction(prompt, sampleCatalog());

    const outputPath = path.join(
      root,
      'library/ontologies/document-types/enforcement-actions/jurisdictions/se/examples/enforcement-actions/svea_back.md'
    );
    const generated = await fs.readFile(outputPath, 'utf8');

    assert.match(generated, /- fine: no/);
    assert.doesNotMatch(generated, /- fine_amount:/);
    assert.doesNotMatch(generated, /- currency:/);

    const indexContent = await fs.readFile(
      path.join(root, 'library/taxonomy/index_enforcement_actions.md'),
      'utf8'
    );
    assert.match(indexContent, /Enforcement Action: \[svea_back\]/);
  });
});
