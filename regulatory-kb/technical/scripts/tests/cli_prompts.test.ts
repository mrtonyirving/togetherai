import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BACK_SENTINEL,
  checkboxWithBack,
  inputValidated,
  inputValidatedWithBack,
  selectOptionalNumberOrCustom,
  selectOptionalNumberOrCustomWithBack,
  selectOrCustom,
  selectOrCustomWithBack,
  selectYesNoBack,
  type CheckboxChoice,
  type PromptAdapter,
  type SelectChoice
} from '../lib/cli_prompts.js';

type Step<TConfig, TValue> = TValue | ((config: TConfig) => TValue);
type SelectConfig = {
  message: string;
  choices: Array<SelectChoice<unknown>>;
  defaultValue?: unknown;
};

class MockPromptAdapter implements PromptAdapter {
  private readonly selectQueue: Array<
    Step<{ message: string; choices: Array<SelectChoice<unknown>>; defaultValue?: unknown }, unknown>
  >;
  private readonly confirmQueue: Array<Step<{ message: string; defaultValue?: boolean }, boolean>>;
  private readonly inputQueue: Array<Step<{ message: string; defaultValue?: string }, string>>;
  private readonly checkboxQueue: Array<
    Step<{ message: string; choices: Array<CheckboxChoice<unknown>> }, unknown[]>
  >;

  readonly inputCalls: Array<{ message: string; defaultValue?: string }> = [];

  constructor(options: {
    select?: Array<
      Step<{ message: string; choices: Array<SelectChoice<unknown>>; defaultValue?: unknown }, unknown>
    >;
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
    return this.takeStep(
      this.selectQueue,
      'select',
      {
        message: options.message,
        choices: options.choices as Array<SelectChoice<unknown>>,
        defaultValue: options.defaultValue
      }
    ) as T;
  }

  async confirm(options: { message: string; defaultValue?: boolean }): Promise<boolean> {
    return this.takeStep(this.confirmQueue, 'confirm', options);
  }

  async input(options: { message: string; defaultValue?: string }): Promise<string> {
    this.inputCalls.push(options);
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

test('selectOrCustom returns existing value without custom input', async () => {
  const prompt = new MockPromptAdapter({
    select: [
      (config: SelectConfig) =>
        config.choices.find((choice: SelectChoice<unknown>) => choice.name === 'beta')?.value ??
        config.choices[0].value
    ]
  });

  const selected = await selectOrCustom(prompt, {
    message: 'Pick value',
    options: ['alpha', 'beta'],
    customInputMessage: 'Custom value'
  });

  assert.equal(selected, 'beta');
  assert.equal(prompt.inputCalls.length, 0);
});

test('selectOrCustom uses custom path and retries until validation succeeds', async () => {
  const prompt = new MockPromptAdapter({
    select: [
      (config: SelectConfig) =>
        config.choices.find((choice: SelectChoice<unknown>) => choice.name === 'Custom...')?.value ??
        config.choices[0].value
    ],
    input: ['', 'new_option']
  });

  const originalLog = console.log;
  console.log = () => undefined;
  let selected: string;
  try {
    selected = await selectOrCustom(prompt, {
      message: 'Concept slug',
      options: ['existing_slug'],
      customInputMessage: 'Custom concept slug',
      validateCustom: (value) => (value.trim().length === 0 ? 'slug required' : undefined)
    });
  } finally {
    console.log = originalLog;
  }

  assert.equal(selected, 'new_option');
  assert.equal(prompt.inputCalls.length, 2);
});

test('selectOptionalNumberOrCustom returns undefined when Skip is selected', async () => {
  const prompt = new MockPromptAdapter({
    select: [
      (config: SelectConfig) =>
        config.choices.find((choice: SelectChoice<unknown>) => choice.name === 'Skip')?.value ??
        config.choices[0].value
    ]
  });

  const selected = await selectOptionalNumberOrCustom(prompt, {
    message: 'Paragraph',
    existingValues: [1, 2, 3],
    parseCustom: (value) => Number.parseInt(value, 10)
  });

  assert.equal(selected, undefined);
});

test('selectOptionalNumberOrCustom accepts prefixed custom values', async () => {
  const prompt = new MockPromptAdapter({
    select: [
      (config: SelectConfig) =>
        config.choices.find((choice: SelectChoice<unknown>) => choice.name === 'Custom...')?.value ??
        config.choices[0].value
    ],
    input: ['p2']
  });

  const selected = await selectOptionalNumberOrCustom(prompt, {
    message: 'Paragraph',
    existingValues: [],
    parseCustom: (value) => {
      const match = value.trim().toLowerCase().match(/^(?:p)?(\d+)$/);
      if (!match) {
        throw new Error("Paragraph must be a positive integer or 'pN'");
      }
      const parsed = Number.parseInt(match[1], 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error("Paragraph must be a positive integer or 'pN'");
      }
      return parsed;
    }
  });

  assert.equal(selected, 2);
});

test('selectOptionalNumberOrCustom treats blank custom input as skip for optional prompts', async () => {
  const prompt = new MockPromptAdapter({
    select: [
      (config: SelectConfig) =>
        config.choices.find((choice: SelectChoice<unknown>) => choice.name === 'Custom...')?.value ??
        config.choices[0].value
    ],
    input: ['']
  });

  const selected = await selectOptionalNumberOrCustom(prompt, {
    message: 'Stycke (optional)',
    existingValues: [1, 2],
    parseCustom: (value) => {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error('Stycke must be a positive integer');
      }
      return parsed;
    }
  });

  assert.equal(selected, undefined);
  assert.equal(prompt.inputCalls.length, 1);
});

test('inputValidatedWithBack returns BACK sentinel for /back (case-insensitive)', async () => {
  const prompt = new MockPromptAdapter({
    input: [' /BACK ']
  });

  const value = await inputValidatedWithBack(prompt, {
    message: 'Value'
  });

  assert.equal(value, BACK_SENTINEL);
});

test('selectOrCustomWithBack returns BACK when Back is selected', async () => {
  const prompt = new MockPromptAdapter({
    select: [
      (config: SelectConfig) =>
        config.choices.find((choice: SelectChoice<unknown>) => choice.name === 'Back')?.value ??
        config.choices[0].value
    ]
  });

  const selected = await selectOrCustomWithBack(prompt, {
    message: 'Pick value',
    options: ['alpha', 'beta'],
    customInputMessage: 'Custom value'
  });

  assert.equal(selected, BACK_SENTINEL);
});

test('selectOrCustomWithBack returns BACK when /back is entered in custom input', async () => {
  const prompt = new MockPromptAdapter({
    select: [
      (config: SelectConfig) =>
        config.choices.find((choice: SelectChoice<unknown>) => choice.name === 'Custom...')?.value ??
        config.choices[0].value
    ],
    input: ['/back']
  });

  const selected = await selectOrCustomWithBack(prompt, {
    message: 'Pick value',
    options: ['alpha', 'beta'],
    customInputMessage: 'Custom value'
  });

  assert.equal(selected, BACK_SENTINEL);
});

test('selectOptionalNumberOrCustomWithBack returns BACK when Back is selected', async () => {
  const prompt = new MockPromptAdapter({
    select: [
      (config: SelectConfig) =>
        config.choices.find((choice: SelectChoice<unknown>) => choice.name === 'Back')?.value ??
        config.choices[0].value
    ]
  });

  const selected = await selectOptionalNumberOrCustomWithBack(prompt, {
    message: 'Paragraph',
    existingValues: [1, 2, 3],
    parseCustom: (value) => Number.parseInt(value, 10)
  });

  assert.equal(selected, BACK_SENTINEL);
});

test('selectOptionalNumberOrCustomWithBack treats blank custom input as skip for optional prompts', async () => {
  const prompt = new MockPromptAdapter({
    select: [
      (config: SelectConfig) =>
        config.choices.find((choice: SelectChoice<unknown>) => choice.name === 'Custom...')?.value ??
        config.choices[0].value
    ],
    input: ['']
  });

  const selected = await selectOptionalNumberOrCustomWithBack(prompt, {
    message: 'Stycke (optional)',
    existingValues: [1, 2],
    parseCustom: (value) => {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error('Stycke must be a positive integer');
      }
      return parsed;
    }
  });

  assert.equal(selected, undefined);
  assert.equal(prompt.inputCalls.length, 1);
});

test('selectYesNoBack returns BACK when Back is selected', async () => {
  const prompt = new MockPromptAdapter({
    select: [
      (config: SelectConfig) =>
        config.choices.find((choice: SelectChoice<unknown>) => choice.name === 'Back')?.value ??
        config.choices[0].value
    ]
  });

  const selected = await selectYesNoBack(prompt, {
    message: 'Continue?'
  });

  assert.equal(selected, BACK_SENTINEL);
});

test('checkboxWithBack returns BACK when Back is selected with other values', async () => {
  const prompt = new MockPromptAdapter({
    checkbox: [
      (config: { message: string; choices: Array<CheckboxChoice<unknown>> }) => [
        config.choices.find((choice) => choice.name === 'alpha')?.value ?? config.choices[0].value,
        config.choices.find((choice) => choice.name === 'Back')?.value ?? config.choices[0].value
      ]
    ]
  });

  const selected = await checkboxWithBack(prompt, {
    message: 'Select topics',
    choices: [
      { name: 'alpha', value: 'alpha' },
      { name: 'beta', value: 'beta' }
    ]
  });

  assert.equal(selected, BACK_SENTINEL);
});

test('inputValidated trims user input and applies validation', async () => {
  const prompt = new MockPromptAdapter({
    input: ['   ', ' valid_value ']
  });

  const originalLog = console.log;
  console.log = () => undefined;
  let value: string;
  try {
    value = await inputValidated(prompt, {
      message: 'Value',
      validate: (entry) => (entry.length === 0 ? 'Value required' : undefined)
    });
  } finally {
    console.log = originalLog;
  }

  assert.equal(value, 'valid_value');
});
