import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BACK_SENTINEL,
  type CheckboxChoice,
  type PromptAdapter,
  type SelectChoice
} from '../lib/cli_prompts.js';
import {
  promptConceptsCoveredWithBack,
  promptStatutoryReferencesWithBack,
  promptSwedishAddressWithBack
} from '../lib/scaffold/prompts.js';
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
    conceptSlugs: ['general_risk_assessment'],
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
            styckeNumbersByChapterParagraph: { '1:1': [1, 2] },
            punktNumbersByChapterParagraphStycke: {
              '1:1:1': [1],
              '1:1:2': [3]
            }
          }
        ]
      }
    ]
  };
}

test('promptSwedishAddressWithBack supports one-step back and resets dependent fields', async () => {
  const prompt = new MockPromptAdapter({
    select: [
      (config: SelectConfig) => pickChoiceByName(config, 'Sweden (SE)'),
      (config: SelectConfig) => pickChoiceByName(config, '2017:630'),
      (config: SelectConfig) => pickChoiceByName(config, '2017:630'),
      (config: SelectConfig) => pickChoiceByName(config, '1'),
      (config: SelectConfig) => pickChoiceByName(config, '1'),
      (config: SelectConfig) => pickChoiceByName(config, '1'),
      (config: SelectConfig) => pickChoiceByName(config, 'Back'),
      (config: SelectConfig) => pickChoiceByName(config, '2'),
      (config: SelectConfig) => pickChoiceByName(config, '3')
    ]
  });

  const address = await promptSwedishAddressWithBack(prompt, sampleCatalog(), {
    requireParagraph: true
  });

  assert.equal(address, 'SE,RD,2017:630,k1,p1,s2,pt3');
});

test('promptStatutoryReferencesWithBack edits last reference when backing from add-another', async () => {
  const prompt = new MockPromptAdapter({
    select: [
      (config: SelectConfig) => pickChoiceByName(config, 'Yes'),
      (config: SelectConfig) => pickChoiceByName(config, 'Sweden (SE)'),
      (config: SelectConfig) => pickChoiceByName(config, '2017:630'),
      (config: SelectConfig) => pickChoiceByName(config, '2017:630'),
      (config: SelectConfig) => pickChoiceByName(config, '1'),
      (config: SelectConfig) => pickChoiceByName(config, '1'),
      (config: SelectConfig) => pickChoiceByName(config, '1'),
      (config: SelectConfig) => pickChoiceByName(config, 'Skip'),
      (config: SelectConfig) => pickChoiceByName(config, 'Back'),
      (config: SelectConfig) => pickChoiceByName(config, 'Sweden (SE)'),
      (config: SelectConfig) => pickChoiceByName(config, '2017:630'),
      (config: SelectConfig) => pickChoiceByName(config, '2017:630'),
      (config: SelectConfig) => {
        assert.equal(config.defaultValue, 1);
        return pickChoiceByName(config, '1');
      },
      (config: SelectConfig) => {
        assert.equal(config.defaultValue, 1);
        return pickChoiceByName(config, '1');
      },
      (config: SelectConfig) => {
        assert.equal(config.defaultValue, 1);
        return pickChoiceByName(config, '1');
      },
      (config: SelectConfig) => pickChoiceByName(config, 'Skip'),
      (config: SelectConfig) => pickChoiceByName(config, 'No')
    ]
  });

  const references = await promptStatutoryReferencesWithBack(prompt, sampleCatalog(), {
    firstQuestion: 'Add statutory reference?',
    requireAtLeastOne: false,
    requireParagraph: true
  });

  assert.deepEqual(references, ['SE,RD,2017:630,k1,p1,s1']);
});

test('promptConceptsCoveredWithBack edits last concept when backing from add-another', async () => {
  await withTempCwd('scaffold-prompts-back-concepts-', async (root) => {
    await writeFixtureFile(
      root,
      'library/taxonomy/index_concepts.md',
      `
# Concept Index

- Concept: [general_risk_assessment](AML/concepts/general_risk_assessment/general_risk_assessment.md)
`
    );

    await writeFixtureFile(
      root,
      'library/taxonomy/AML/concepts/general_risk_assessment/general_risk_assessment.md',
      `
# general_risk_assessment
`
    );

    const prompt = new MockPromptAdapter({
      select: [
        (config: SelectConfig) => pickChoiceByName(config, 'Yes'),
        (config: SelectConfig) => pickChoiceByName(config, 'Back'),
        (config: SelectConfig) => pickChoiceByName(config, 'No')
      ],
      input: [
        'general_risk_assessment',
        (config: { message: string; defaultValue?: string }) => {
          assert.equal(config.defaultValue, 'general_risk_assessment');
          return 'general_risk_assessment';
        }
      ]
    });

    const conceptIds = await promptConceptsCoveredWithBack(prompt);
    assert.deepEqual(conceptIds, ['general_risk_assessment']);
  });
});

test('promptSwedishAddressWithBack returns BACK when back is selected on first step', async () => {
  const prompt = new MockPromptAdapter({
    select: [
      (config: SelectConfig) => pickChoiceByName(config, 'Back')
    ]
  });

  const result = await promptSwedishAddressWithBack(prompt, sampleCatalog(), {
    requireParagraph: true
  });

  assert.equal(result, BACK_SENTINEL);
});
