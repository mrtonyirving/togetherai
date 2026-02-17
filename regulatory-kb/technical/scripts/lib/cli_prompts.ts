import {
  checkbox as checkboxPrompt,
  confirm as confirmPrompt,
  input as inputPrompt,
  select as selectPrompt
} from '@inquirer/prompts';

export interface SelectChoice<T> {
  name: string;
  value: T;
  description?: string;
  disabled?: boolean | string;
}

export interface CheckboxChoice<T> extends SelectChoice<T> {
  checked?: boolean;
}

export interface PromptAdapter {
  select<T>(options: {
    message: string;
    choices: Array<SelectChoice<T>>;
    pageSize?: number;
    defaultValue?: T;
  }): Promise<T>;
  confirm(options: {
    message: string;
    defaultValue?: boolean;
  }): Promise<boolean>;
  input(options: {
    message: string;
    defaultValue?: string;
  }): Promise<string>;
  checkbox<T>(options: {
    message: string;
    choices: Array<CheckboxChoice<T>>;
    pageSize?: number;
  }): Promise<T[]>;
}

const CUSTOM_SENTINEL = '__codex_custom__' as const;
const SKIP_SENTINEL = '__codex_skip__' as const;
export const BACK_SENTINEL = '__codex_back__' as const;
export const BACK_INPUT_TOKEN = '/back';

export function isBackSentinel(value: unknown): value is typeof BACK_SENTINEL {
  return value === BACK_SENTINEL;
}

export const interactivePromptAdapter: PromptAdapter = {
  async select<T>(options: {
    message: string;
    choices: Array<SelectChoice<T>>;
    pageSize?: number;
    defaultValue?: T;
  }): Promise<T> {
    return selectPrompt({
      message: options.message,
      choices: options.choices,
      pageSize: options.pageSize,
      default: options.defaultValue
    });
  },

  async confirm(options): Promise<boolean> {
    return confirmPrompt({
      message: options.message,
      default: options.defaultValue
    });
  },

  async input(options): Promise<string> {
    return inputPrompt({
      message: options.message,
      default: options.defaultValue
    });
  },

  async checkbox<T>(options: {
    message: string;
    choices: Array<CheckboxChoice<T>>;
    pageSize?: number;
  }): Promise<T[]> {
    return checkboxPrompt({
      message: options.message,
      choices: options.choices,
      pageSize: options.pageSize
    });
  }
};

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value) && value > 0))).sort(
    (a, b) => a - b
  );
}

export async function inputValidated(
  prompt: PromptAdapter,
  options: {
    message: string;
    defaultValue?: string;
    normalize?: (value: string) => string;
    validate?: (value: string) => string | undefined;
  }
): Promise<string> {
  while (true) {
    const raw = await prompt.input({
      message: options.message,
      defaultValue: options.defaultValue
    });

    const normalized = options.normalize ? options.normalize(raw) : raw.trim();
    const errorMessage = options.validate ? options.validate(normalized) : undefined;
    if (!errorMessage) {
      return normalized;
    }

    console.log(errorMessage);
  }
}

export async function inputValidatedWithBack(
  prompt: PromptAdapter,
  options: {
    message: string;
    defaultValue?: string;
    normalize?: (value: string) => string;
    validate?: (value: string) => string | undefined;
  }
): Promise<string | typeof BACK_SENTINEL> {
  while (true) {
    const raw = await prompt.input({
      message: options.message,
      defaultValue: options.defaultValue
    });

    const normalized = options.normalize ? options.normalize(raw) : raw.trim();
    if (normalized.trim().toLowerCase() === BACK_INPUT_TOKEN) {
      return BACK_SENTINEL;
    }

    const errorMessage = options.validate ? options.validate(normalized) : undefined;
    if (!errorMessage) {
      return normalized;
    }

    console.log(errorMessage);
  }
}

export async function selectOrCustom(
  prompt: PromptAdapter,
  options: {
    message: string;
    options: string[];
    customInputMessage: string;
    customLabel?: string;
    validateCustom?: (value: string) => string | undefined;
    normalizeCustom?: (value: string) => string;
    pageSize?: number;
  }
): Promise<string> {
  const values = uniqueStrings(options.options);
  if (values.length === 0) {
    return inputValidated(prompt, {
      message: options.customInputMessage,
      normalize: options.normalizeCustom,
      validate: options.validateCustom
    });
  }

  const choices: Array<SelectChoice<string | typeof CUSTOM_SENTINEL>> = values.map((value) => ({
    name: value,
    value
  }));
  choices.push({
    name: options.customLabel ?? 'Custom...',
    value: CUSTOM_SENTINEL
  });

  const selected = await prompt.select({
    message: options.message,
    choices,
    pageSize: options.pageSize
  });

  if (selected !== CUSTOM_SENTINEL) {
    return selected;
  }

  return inputValidated(prompt, {
    message: options.customInputMessage,
    normalize: options.normalizeCustom,
    validate: options.validateCustom
  });
}

export async function selectOrCustomWithBack(
  prompt: PromptAdapter,
  options: {
    message: string;
    options: string[];
    customInputMessage: string;
    customLabel?: string;
    validateCustom?: (value: string) => string | undefined;
    normalizeCustom?: (value: string) => string;
    pageSize?: number;
    defaultValue?: string;
    customDefaultValue?: string;
    backLabel?: string;
  }
): Promise<string | typeof BACK_SENTINEL> {
  const values = uniqueStrings(options.options);
  if (values.length === 0) {
    return inputValidatedWithBack(prompt, {
      message: options.customInputMessage,
      defaultValue: options.customDefaultValue ?? options.defaultValue,
      normalize: options.normalizeCustom,
      validate: options.validateCustom
    });
  }

  const choices: Array<
    SelectChoice<string | typeof CUSTOM_SENTINEL | typeof BACK_SENTINEL>
  > = values.map((value) => ({
    name: value,
    value
  }));
  choices.push({
    name: options.customLabel ?? 'Custom...',
    value: CUSTOM_SENTINEL
  });
  choices.push({
    name: options.backLabel ?? 'Back',
    value: BACK_SENTINEL
  });

  const desiredDefault = options.defaultValue?.trim();
  let selectDefaultValue:
    | string
    | typeof CUSTOM_SENTINEL
    | typeof BACK_SENTINEL
    | undefined;
  let customDefaultValue = options.customDefaultValue;

  if (desiredDefault) {
    if (values.includes(desiredDefault)) {
      selectDefaultValue = desiredDefault;
    } else {
      selectDefaultValue = CUSTOM_SENTINEL;
      if (!customDefaultValue) {
        customDefaultValue = desiredDefault;
      }
    }
  }

  const selected = await prompt.select({
    message: options.message,
    choices,
    pageSize: options.pageSize,
    defaultValue: selectDefaultValue
  });

  if (selected === BACK_SENTINEL) {
    return BACK_SENTINEL;
  }
  if (selected !== CUSTOM_SENTINEL) {
    return selected;
  }

  return inputValidatedWithBack(prompt, {
    message: options.customInputMessage,
    defaultValue: customDefaultValue,
    normalize: options.normalizeCustom,
    validate: options.validateCustom
  });
}

export async function selectOptionalNumberOrCustom(
  prompt: PromptAdapter,
  options: {
    message: string;
    existingValues: number[];
    parseCustom: (value: string) => number;
    customInputMessage?: string;
    customLabel?: string;
    required?: boolean;
    skipLabel?: string;
    pageSize?: number;
  }
): Promise<number | undefined> {
  const normalizedExisting = uniqueNumbers(options.existingValues);
  const choiceEntries: Array<SelectChoice<number | typeof CUSTOM_SENTINEL | typeof SKIP_SENTINEL>> =
    normalizedExisting.map((value) => ({
      name: String(value),
      value
    }));

  if (!options.required) {
    choiceEntries.push({
      name: options.skipLabel ?? 'Skip',
      value: SKIP_SENTINEL
    });
  }

  choiceEntries.push({
    name: options.customLabel ?? 'Custom...',
    value: CUSTOM_SENTINEL
  });

  const selected = await prompt.select({
    message: options.message,
    choices: choiceEntries,
    pageSize: options.pageSize
  });

  if (selected === SKIP_SENTINEL) {
    return undefined;
  }
  if (selected !== CUSTOM_SENTINEL) {
    return selected;
  }

  const customValue = await inputValidated(prompt, {
    message: options.customInputMessage ?? `${options.message} (custom): `,
    validate: (raw) => {
      if (!options.required && raw.length === 0) {
        return undefined;
      }
      try {
        options.parseCustom(raw);
        return undefined;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }
  });

  if (!options.required && customValue.length === 0) {
    return undefined;
  }

  return options.parseCustom(customValue);
}

export async function selectOptionalNumberOrCustomWithBack(
  prompt: PromptAdapter,
  options: {
    message: string;
    existingValues: number[];
    parseCustom: (value: string) => number;
    customInputMessage?: string;
    customLabel?: string;
    required?: boolean;
    skipLabel?: string;
    pageSize?: number;
    defaultValue?: number;
    customDefaultValue?: string;
    backLabel?: string;
  }
): Promise<number | undefined | typeof BACK_SENTINEL> {
  const normalizedExisting = uniqueNumbers(options.existingValues);
  const choiceEntries: Array<
    SelectChoice<
      number | typeof CUSTOM_SENTINEL | typeof SKIP_SENTINEL | typeof BACK_SENTINEL
    >
  > = normalizedExisting.map((value) => ({
    name: String(value),
    value
  }));

  if (!options.required) {
    choiceEntries.push({
      name: options.skipLabel ?? 'Skip',
      value: SKIP_SENTINEL
    });
  }

  choiceEntries.push({
    name: options.customLabel ?? 'Custom...',
    value: CUSTOM_SENTINEL
  });
  choiceEntries.push({
    name: options.backLabel ?? 'Back',
    value: BACK_SENTINEL
  });

  let selectDefaultValue:
    | number
    | typeof CUSTOM_SENTINEL
    | typeof SKIP_SENTINEL
    | typeof BACK_SENTINEL
    | undefined;
  let customDefaultValue = options.customDefaultValue;
  if (options.defaultValue !== undefined) {
    if (normalizedExisting.includes(options.defaultValue)) {
      selectDefaultValue = options.defaultValue;
    } else {
      selectDefaultValue = CUSTOM_SENTINEL;
      if (!customDefaultValue) {
        customDefaultValue = String(options.defaultValue);
      }
    }
  }

  const selected = await prompt.select({
    message: options.message,
    choices: choiceEntries,
    pageSize: options.pageSize,
    defaultValue: selectDefaultValue
  });

  if (selected === BACK_SENTINEL) {
    return BACK_SENTINEL;
  }
  if (selected === SKIP_SENTINEL) {
    return undefined;
  }
  if (selected !== CUSTOM_SENTINEL) {
    return selected;
  }

  const customValue = await inputValidatedWithBack(prompt, {
    message: options.customInputMessage ?? `${options.message} (custom): `,
    defaultValue: customDefaultValue,
    validate: (raw) => {
      if (!options.required && raw.length === 0) {
        return undefined;
      }
      try {
        options.parseCustom(raw);
        return undefined;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }
  });

  if (customValue === BACK_SENTINEL) {
    return BACK_SENTINEL;
  }
  if (!options.required && customValue.length === 0) {
    return undefined;
  }

  return options.parseCustom(customValue);
}

export async function selectYesNoBack(
  prompt: PromptAdapter,
  options: {
    message: string;
    defaultValue?: boolean;
    yesLabel?: string;
    noLabel?: string;
    backLabel?: string;
    pageSize?: number;
  }
): Promise<boolean | typeof BACK_SENTINEL> {
  return prompt.select<boolean | typeof BACK_SENTINEL>({
    message: options.message,
    choices: [
      { name: options.yesLabel ?? 'Yes', value: true },
      { name: options.noLabel ?? 'No', value: false },
      { name: options.backLabel ?? 'Back', value: BACK_SENTINEL }
    ],
    pageSize: options.pageSize,
    defaultValue: options.defaultValue
  });
}

export async function checkboxWithBack<T>(
  prompt: PromptAdapter,
  options: {
    message: string;
    choices: Array<CheckboxChoice<T>>;
    pageSize?: number;
    backLabel?: string;
  }
): Promise<T[] | typeof BACK_SENTINEL> {
  const choices: Array<CheckboxChoice<T | typeof BACK_SENTINEL>> = [
    ...options.choices.map((choice) => ({
      ...choice,
      value: choice.value as T | typeof BACK_SENTINEL
    })),
    {
      name: options.backLabel ?? 'Back',
      value: BACK_SENTINEL
    }
  ];

  const selected = await prompt.checkbox<T | typeof BACK_SENTINEL>({
    message: options.message,
    choices,
    pageSize: options.pageSize
  });

  if (selected.some((value) => value === BACK_SENTINEL)) {
    return BACK_SENTINEL;
  }

  return selected as T[];
}
