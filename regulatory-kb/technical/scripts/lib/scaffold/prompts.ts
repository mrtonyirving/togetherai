import fs from 'fs-extra';

import {
  BACK_SENTINEL,
  inputValidated,
  inputValidatedWithBack,
  isBackSentinel,
  selectOptionalNumberOrCustom,
  selectOptionalNumberOrCustomWithBack,
  selectOrCustom,
  selectOrCustomWithBack,
  selectYesNoBack,
  type PromptAdapter
} from '../cli_prompts.js';
import {
  findJurisdictionCatalog,
  getParagraphNumbers,
  getPunktNumbers,
  getStyckeNumbers,
  type LawCatalog,
  type ScaffoldCatalog
} from '../scaffold_catalog.js';
import { repoPath } from '../io.js';
import { parseCanonicalReference } from '../reference_contract.js';
import { readConceptIndex } from './indexes.js';
import {
  dedupeAndSort,
  parseAndValidateConceptId,
  parseLawCode,
  parseLawCodeValidationMessage,
  parseRequiredPositiveIntegerComponent,
  toProvisionAddress
} from './references.js';

function formatLawChoiceName(law: LawCatalog): string {
  if (law.lawCodeCandidates.length === 0) {
    return law.name;
  }

  const primaryCode = law.lawCodeCandidates[0];
  if (law.name.includes(primaryCode)) {
    return law.name;
  }
  return `${law.name} (${primaryCode})`;
}

function toLawChoiceMap(laws: LawCatalog[]): Map<string, LawCatalog> {
  const map = new Map<string, LawCatalog>();
  for (const law of laws) {
    map.set(formatLawChoiceName(law), law);
  }
  return map;
}

export async function promptLawCode(
  prompt: PromptAdapter,
  candidates: string[],
  options: {
    message: string;
    customInputMessage: string;
  }
): Promise<string> {
  const normalizedCandidates = dedupeAndSort(candidates);
  if (normalizedCandidates.length === 0) {
    const custom = await inputValidated(prompt, {
      message: options.customInputMessage,
      validate: parseLawCodeValidationMessage
    });
    return parseLawCode(custom);
  }

  const selected = await selectOrCustom(prompt, {
    message: options.message,
    options: normalizedCandidates,
    customInputMessage: options.customInputMessage,
    customLabel: 'Custom law number...',
    validateCustom: parseLawCodeValidationMessage
  });
  return parseLawCode(selected);
}

export async function promptLawCodeWithBack(
  prompt: PromptAdapter,
  candidates: string[],
  options: {
    message: string;
    customInputMessage: string;
    defaultValue?: string;
  }
): Promise<string | typeof BACK_SENTINEL> {
  const normalizedCandidates = dedupeAndSort(candidates);
  if (normalizedCandidates.length === 0) {
    const custom = await inputValidatedWithBack(prompt, {
      message: options.customInputMessage,
      defaultValue: options.defaultValue,
      validate: parseLawCodeValidationMessage
    });
    if (isBackSentinel(custom)) {
      return BACK_SENTINEL;
    }
    return parseLawCode(custom);
  }

  const selected = await selectOrCustomWithBack(prompt, {
    message: options.message,
    options: normalizedCandidates,
    customInputMessage: options.customInputMessage,
    customLabel: 'Custom law number...',
    validateCustom: parseLawCodeValidationMessage,
    defaultValue: options.defaultValue
  });
  if (isBackSentinel(selected)) {
    return BACK_SENTINEL;
  }
  return parseLawCode(selected);
}

function findLawChoiceByLawCode(
  lawChoices: Map<string, LawCatalog>,
  lawCode: string
): { selection: string; law: LawCatalog } | undefined {
  for (const [selection, law] of lawChoices.entries()) {
    if (law.lawCodeCandidates.includes(lawCode) || law.name === lawCode) {
      return { selection, law };
    }
  }
  return undefined;
}

export async function promptSwedishAddressWithBack(
  prompt: PromptAdapter,
  catalog: ScaffoldCatalog,
  options: {
    requireParagraph: boolean;
    initialAddress?: string;
  }
): Promise<string | typeof BACK_SENTINEL> {
  const swedenCatalog = findJurisdictionCatalog(catalog, 'Sweden');
  const swedenLaws = swedenCatalog?.laws ?? [];
  const lawChoices = toLawChoiceMap(swedenLaws);

  let selectedJurisdiction: 'SE' | 'EU' = 'SE';
  let selectedLaw: LawCatalog | undefined;
  let lawSelection: string | undefined;
  let lawCode: string | undefined;
  let chapter: number | undefined;
  let paragraph: number | undefined;
  let stycke: number | undefined;
  let punkt: number | undefined;
  let euAddressInput: string | undefined;

  if (options.initialAddress) {
    const parsed = parseCanonicalReference(options.initialAddress, 'initial statutory reference');
    selectedJurisdiction = parsed.jurisdiction;
    if (parsed.jurisdiction === 'SE') {
      lawCode = parsed.law;
      chapter = parsed.chapter;
      paragraph = parsed.paragraph;
      stycke = parsed.stycke;
      punkt = parsed.punkt;

      const matchedLaw = findLawChoiceByLawCode(lawChoices, parsed.law);
      if (matchedLaw) {
        selectedLaw = matchedLaw.law;
        lawSelection = matchedLaw.selection;
      } else {
        lawSelection = parsed.law;
      }
    } else {
      euAddressInput = parsed.canonical;
    }
  }

  type Step =
    | 'jurisdiction'
    | 'euAddress'
    | 'law'
    | 'lawCode'
    | 'chapter'
    | 'paragraph'
    | 'stycke'
    | 'punkt'
    | 'done';
  let step: Step = 'jurisdiction';

  while (step !== 'done') {
    if (step === 'jurisdiction') {
      const jurisdiction = await prompt.select({
        message: 'Jurisdiction:',
        choices: [
          { name: 'Sweden (SE)', value: 'SE' as const },
          { name: 'EU', value: 'EU' as const },
          { name: 'Back', value: BACK_SENTINEL }
        ],
        defaultValue: selectedJurisdiction
      });

      if (isBackSentinel(jurisdiction)) {
        return BACK_SENTINEL;
      }
      selectedJurisdiction = jurisdiction;
      step = jurisdiction === 'SE' ? 'law' : 'euAddress';
      continue;
    }

    if (step === 'euAddress') {
      const addressResult = await inputValidatedWithBack(prompt, {
        message:
          'EU canonical address (EU,RD,<citation>[,rN[-M]][,chX[,secY[,artZ[,ahslug[,parA[,subB[,ptC[,indD]]]]]]]]): ',
        defaultValue: euAddressInput,
        validate: (value) => {
          try {
            const parsed = parseCanonicalReference(value, 'EU statutory reference');
            if (parsed.jurisdiction !== 'EU') {
              return 'Reference must start with EU,RD';
            }
            return undefined;
          } catch (error) {
            return error instanceof Error ? error.message : String(error);
          }
        }
      });

      if (isBackSentinel(addressResult)) {
        step = 'jurisdiction';
        continue;
      }

      const parsed = parseCanonicalReference(addressResult, 'EU statutory reference');
      if (parsed.jurisdiction !== 'EU') {
        throw new Error(`Unsupported jurisdiction '${parsed.jurisdiction}'`);
      }
      return parsed.canonical;
    }

    if (step === 'law') {
      if (lawChoices.size > 0) {
        const lawResult = await selectOrCustomWithBack(prompt, {
          message: 'Law (from legislation):',
          options: [...lawChoices.keys()],
          customInputMessage: 'Custom law number (e.g. 2017:630): ',
          customLabel: 'Custom law number...',
          validateCustom: parseLawCodeValidationMessage,
          defaultValue: lawSelection ?? lawCode
        });

        if (isBackSentinel(lawResult)) {
          step = 'jurisdiction';
          continue;
        }

        const previousLawSelection = lawSelection;
        const previousLawCode = lawCode;
        lawSelection = lawResult;
        selectedLaw = lawChoices.get(lawResult);

        if (selectedLaw) {
          if (previousLawSelection !== lawSelection) {
            if (
              lawCode === undefined ||
              !selectedLaw.lawCodeCandidates.includes(lawCode)
            ) {
              lawCode = selectedLaw.lawCodeCandidates[0];
            }
            chapter = undefined;
            paragraph = undefined;
            stycke = undefined;
            punkt = undefined;
          }
          step = 'lawCode';
          continue;
        }

        const parsedLawCode = parseLawCode(lawResult);
        if (previousLawSelection !== lawSelection || previousLawCode !== parsedLawCode) {
          chapter = undefined;
          paragraph = undefined;
          stycke = undefined;
          punkt = undefined;
        }
        lawCode = parsedLawCode;
        step = 'chapter';
        continue;
      }

      const customLawCode = await inputValidatedWithBack(prompt, {
        message: 'Law number (e.g. 2017:630): ',
        defaultValue: lawCode,
        validate: parseLawCodeValidationMessage
      });

      if (isBackSentinel(customLawCode)) {
        step = 'jurisdiction';
        continue;
      }

      const parsedLawCode = parseLawCode(customLawCode);
      if (parsedLawCode !== lawCode) {
        chapter = undefined;
        paragraph = undefined;
        stycke = undefined;
        punkt = undefined;
      }
      lawSelection = parsedLawCode;
      lawCode = parsedLawCode;
      selectedLaw = undefined;
      step = 'chapter';
      continue;
    }

    if (step === 'lawCode') {
      if (!selectedLaw) {
        step = 'chapter';
        continue;
      }

      const lawCodeResult = await promptLawCodeWithBack(
        prompt,
        selectedLaw.lawCodeCandidates,
        {
          message: 'Law number (e.g. 2017:630):',
          customInputMessage: 'Custom law number (e.g. 2017:630): ',
          defaultValue: lawCode
        }
      );

      if (isBackSentinel(lawCodeResult)) {
        step = 'law';
        continue;
      }

      if (lawCodeResult !== lawCode) {
        chapter = undefined;
        paragraph = undefined;
        stycke = undefined;
        punkt = undefined;
      }
      lawCode = lawCodeResult;
      step = 'chapter';
      continue;
    }

    if (step === 'chapter') {
      const chapterResult = await selectOptionalNumberOrCustomWithBack(prompt, {
        message: 'Chapter (e.g. 1 or k1):',
        existingValues: selectedLaw?.chapterNumbers ?? [],
        required: true,
        parseCustom: (value) => parseRequiredPositiveIntegerComponent(value, 'Chapter', 'k'),
        customInputMessage: 'Chapter (e.g. 1 or k1): ',
        defaultValue: chapter
      });

      if (isBackSentinel(chapterResult)) {
        step = selectedLaw ? 'lawCode' : 'law';
        continue;
      }
      if (chapterResult === undefined) {
        throw new Error('Chapter is required');
      }

      if (chapterResult !== chapter) {
        paragraph = undefined;
        stycke = undefined;
        punkt = undefined;
      }
      chapter = chapterResult;
      step = 'paragraph';
      continue;
    }

    if (step === 'paragraph') {
      if (chapter === undefined) {
        throw new Error('Chapter is required');
      }

      const paragraphResult = await selectOptionalNumberOrCustomWithBack(prompt, {
        message: options.requireParagraph
          ? 'Paragraph (required, e.g. 2 or p2):'
          : 'Paragraph (optional, e.g. 2 or p2):',
        existingValues: getParagraphNumbers(selectedLaw, chapter),
        required: options.requireParagraph,
        parseCustom: (value) => parseRequiredPositiveIntegerComponent(value, 'Paragraph', 'p'),
        customInputMessage: options.requireParagraph
          ? 'Paragraph (required, e.g. 2 or p2): '
          : 'Paragraph (optional, e.g. 2 or p2): ',
        defaultValue: paragraph
      });

      if (isBackSentinel(paragraphResult)) {
        step = 'chapter';
        continue;
      }

      if (paragraphResult !== paragraph) {
        stycke = undefined;
        punkt = undefined;
      }
      paragraph = paragraphResult;
      if (paragraph === undefined) {
        stycke = undefined;
        punkt = undefined;
        step = 'done';
      } else {
        step = 'stycke';
      }
      continue;
    }

    if (step === 'stycke') {
      if (chapter === undefined || paragraph === undefined) {
        step = 'done';
        continue;
      }

      const styckeResult = await selectOptionalNumberOrCustomWithBack(prompt, {
        message: 'Stycke (optional, e.g. 3 or s3):',
        existingValues: getStyckeNumbers(selectedLaw, chapter, paragraph),
        parseCustom: (value) => parseRequiredPositiveIntegerComponent(value, 'Stycke', 's'),
        customInputMessage: 'Stycke (optional, e.g. 3 or s3): ',
        defaultValue: stycke
      });

      if (isBackSentinel(styckeResult)) {
        step = 'paragraph';
        continue;
      }

      if (styckeResult !== stycke) {
        punkt = undefined;
      }
      stycke = styckeResult;
      if (stycke === undefined) {
        punkt = undefined;
        step = 'done';
      } else {
        step = 'punkt';
      }
      continue;
    }

    if (chapter === undefined || paragraph === undefined || stycke === undefined) {
      step = 'done';
      continue;
    }

    const punktResult = await selectOptionalNumberOrCustomWithBack(prompt, {
      message: 'Punkt (optional, e.g. 3 or pt3):',
      existingValues: getPunktNumbers(selectedLaw, chapter, paragraph, stycke),
      parseCustom: (value) => parseRequiredPositiveIntegerComponent(value, 'Punkt', 'pt'),
      customInputMessage: 'Punkt (optional, e.g. 3 or pt3): ',
      defaultValue: punkt
    });

    if (isBackSentinel(punktResult)) {
      step = 'stycke';
      continue;
    }

    punkt = punktResult;
    step = 'done';
  }

  if (lawCode === undefined || chapter === undefined) {
    throw new Error('Law number and chapter are required');
  }

  return toProvisionAddress(lawCode, chapter, paragraph, stycke, punkt);
}

export async function promptSwedishAddress(
  prompt: PromptAdapter,
  catalog: ScaffoldCatalog,
  options: {
    requireParagraph: boolean;
  }
): Promise<string> {
  const jurisdiction = await prompt.select({
    message: 'Jurisdiction:',
    choices: [
      { name: 'Sweden (SE)', value: 'SE' },
      { name: 'EU', value: 'EU' }
    ]
  });

  if (jurisdiction === 'EU') {
    const input = await inputValidated(prompt, {
      message:
        'EU canonical address (EU,RD,<citation>[,rN[-M]][,chX[,secY[,artZ[,ahslug[,parA[,subB[,ptC[,indD]]]]]]]]): ',
      validate: (value) => {
        try {
          const parsed = parseCanonicalReference(value, 'EU statutory reference');
          if (parsed.jurisdiction !== 'EU') {
            return 'Reference must start with EU,RD';
          }
          return undefined;
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      }
    });

    const parsed = parseCanonicalReference(input, 'EU statutory reference');
    if (parsed.jurisdiction !== 'EU') {
      throw new Error(`Unsupported jurisdiction '${parsed.jurisdiction}'`);
    }
    return parsed.canonical;
  }

  const swedenCatalog = findJurisdictionCatalog(catalog, 'Sweden');
  const swedenLaws = swedenCatalog?.laws ?? [];
  const lawChoices = toLawChoiceMap(swedenLaws);

  let selectedLaw: LawCatalog | undefined;
  let lawCode: string;

  if (lawChoices.size > 0) {
    const lawSelection = await selectOrCustom(prompt, {
      message: 'Law (from legislation):',
      options: [...lawChoices.keys()],
      customInputMessage: 'Custom law number (e.g. 2017:630): ',
      customLabel: 'Custom law number...',
      validateCustom: parseLawCodeValidationMessage
    });

    selectedLaw = lawChoices.get(lawSelection);
    if (selectedLaw) {
      lawCode = await promptLawCode(prompt, selectedLaw.lawCodeCandidates, {
        message: 'Law number (e.g. 2017:630):',
        customInputMessage: 'Custom law number (e.g. 2017:630): '
      });
    } else {
      lawCode = parseLawCode(lawSelection);
    }
  } else {
    const customLawCode = await inputValidated(prompt, {
      message: 'Law number (e.g. 2017:630): ',
      validate: parseLawCodeValidationMessage
    });
    lawCode = parseLawCode(customLawCode);
  }

  const chapter = await selectOptionalNumberOrCustom(prompt, {
    message: 'Chapter (e.g. 1 or k1):',
    existingValues: selectedLaw?.chapterNumbers ?? [],
    required: true,
    parseCustom: (value) => parseRequiredPositiveIntegerComponent(value, 'Chapter', 'k'),
    customInputMessage: 'Chapter (e.g. 1 or k1): '
  });
  if (chapter === undefined) {
    throw new Error('Chapter is required');
  }

  const paragraph = await selectOptionalNumberOrCustom(prompt, {
    message: options.requireParagraph
      ? 'Paragraph (required, e.g. 2 or p2):'
      : 'Paragraph (optional, e.g. 2 or p2):',
    existingValues: getParagraphNumbers(selectedLaw, chapter),
    required: options.requireParagraph,
    parseCustom: (value) => parseRequiredPositiveIntegerComponent(value, 'Paragraph', 'p'),
    customInputMessage: options.requireParagraph
      ? 'Paragraph (required, e.g. 2 or p2): '
      : 'Paragraph (optional, e.g. 2 or p2): '
  });

  const stycke =
    paragraph !== undefined
      ? await selectOptionalNumberOrCustom(prompt, {
          message: 'Stycke (optional, e.g. 3 or s3):',
          existingValues: getStyckeNumbers(selectedLaw, chapter, paragraph),
          parseCustom: (value) => parseRequiredPositiveIntegerComponent(value, 'Stycke', 's'),
          customInputMessage: 'Stycke (optional, e.g. 3 or s3): '
        })
      : undefined;

  const punkt =
    stycke !== undefined
      ? await selectOptionalNumberOrCustom(prompt, {
          message: 'Punkt (optional, e.g. 3 or pt3):',
          existingValues: getPunktNumbers(selectedLaw, chapter, paragraph!, stycke),
          parseCustom: (value) => parseRequiredPositiveIntegerComponent(value, 'Punkt', 'pt'),
          customInputMessage: 'Punkt (optional, e.g. 3 or pt3): '
        })
      : undefined;

  return toProvisionAddress(lawCode, chapter, paragraph, stycke, punkt);
}

export async function promptStatutoryReferences(
  prompt: PromptAdapter,
  catalog: ScaffoldCatalog,
  options: {
    firstQuestion: string;
    requireAtLeastOne: boolean;
    requireParagraph?: boolean;
  }
): Promise<string[]> {
  const addresses: string[] = [];
  let shouldAdd = await prompt.confirm({
    message: options.firstQuestion,
    defaultValue: false
  });

  while (shouldAdd) {
    addresses.push(
      await promptSwedishAddress(prompt, catalog, {
        requireParagraph: options.requireParagraph ?? false
      })
    );
    shouldAdd = await prompt.confirm({
      message: 'Add another reference?',
      defaultValue: false
    });
  }

  if (options.requireAtLeastOne && addresses.length === 0) {
    throw new Error('At least one statutory reference is required');
  }

  return Array.from(new Set(addresses));
}

export async function promptStatutoryReferencesWithBack(
  prompt: PromptAdapter,
  catalog: ScaffoldCatalog,
  options: {
    firstQuestion: string;
    requireAtLeastOne: boolean;
    requireParagraph?: boolean;
    initialAddresses?: string[];
  }
): Promise<string[] | typeof BACK_SENTINEL> {
  const addresses = Array.from(
    new Set(
      (options.initialAddresses ?? [])
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );

  type Step = 'initialDecision' | 'addressEntry' | 'continueDecision' | 'done';
  type PreviousDecision = 'initialDecision' | 'continueDecision';
  let step: Step = 'initialDecision';
  let previousDecision: PreviousDecision = 'initialDecision';
  let currentIndex = 0;

  while (step !== 'done') {
    if (step === 'initialDecision') {
      const shouldAdd = await selectYesNoBack(prompt, {
        message: options.firstQuestion,
        defaultValue: addresses.length > 0
      });

      if (isBackSentinel(shouldAdd)) {
        return BACK_SENTINEL;
      }
      if (!shouldAdd) {
        step = 'done';
        continue;
      }

      currentIndex = addresses.length;
      previousDecision = 'initialDecision';
      step = 'addressEntry';
      continue;
    }

    if (step === 'addressEntry') {
      const address = await promptSwedishAddressWithBack(prompt, catalog, {
        requireParagraph: options.requireParagraph ?? false,
        initialAddress: addresses[currentIndex]
      });

      if (isBackSentinel(address)) {
        step = previousDecision;
        continue;
      }

      if (currentIndex < addresses.length) {
        addresses[currentIndex] = address;
      } else {
        addresses.push(address);
      }
      step = 'continueDecision';
      continue;
    }

    const shouldContinue = await selectYesNoBack(prompt, {
      message: 'Add another reference?',
      defaultValue: false
    });

    if (isBackSentinel(shouldContinue)) {
      if (addresses.length === 0) {
        step = 'initialDecision';
        continue;
      }
      currentIndex = addresses.length - 1;
      previousDecision = 'continueDecision';
      step = 'addressEntry';
      continue;
    }
    if (shouldContinue) {
      currentIndex = addresses.length;
      previousDecision = 'continueDecision';
      step = 'addressEntry';
      continue;
    }

    step = 'done';
  }

  if (options.requireAtLeastOne && addresses.length === 0) {
    throw new Error('At least one statutory reference is required');
  }

  return Array.from(new Set(addresses));
}

export async function loadKnownConceptIds(): Promise<Set<string>> {
  const concepts = await readConceptIndex();
  const known = new Set<string>();

  for (const concept of concepts) {
    const conceptId = parseAndValidateConceptId(concept.name);
    const conceptPath = repoPath('library', 'taxonomy', concept.file);
    if (await fs.pathExists(conceptPath)) {
      known.add(conceptId);
    }

    for (const subconcept of concept.subconcepts) {
      const subconceptId = parseAndValidateConceptId(subconcept.name);
      const subconceptPath = repoPath('library', 'taxonomy', subconcept.file);
      if (await fs.pathExists(subconceptPath)) {
        known.add(subconceptId);
      }
    }
  }

  return known;
}

export async function promptConceptsCovered(prompt: PromptAdapter): Promise<string[]> {
  const knownConceptIds = Array.from(await loadKnownConceptIds()).sort((a, b) =>
    a.localeCompare(b)
  );
  if (knownConceptIds.length === 0) {
    return [];
  }

  const conceptIds: string[] = [];
  let shouldAdd = await prompt.confirm({
    message: 'Add concept covered?',
    defaultValue: false
  });
  const knownConceptSet = new Set(knownConceptIds);

  while (shouldAdd) {
    const conceptId = parseAndValidateConceptId(
      await inputValidated(prompt, {
        message: 'Concept ID (normalized to snake_case): ',
        validate: (value) =>
          value.trim().length === 0 ? 'concept_id is required' : undefined
      })
    );
    if (!knownConceptSet.has(conceptId)) {
      throw new Error(
        `Unknown concept_id '${conceptId}' not found in taxonomy concept index/files`
      );
    }

    conceptIds.push(conceptId);
    shouldAdd = await prompt.confirm({
      message: 'Add another concept covered?',
      defaultValue: false
    });
  }

  return Array.from(new Set(conceptIds)).sort((a, b) => a.localeCompare(b));
}

export async function promptConceptsCoveredWithBack(
  prompt: PromptAdapter,
  options: {
    initialConceptIds?: string[];
  } = {}
): Promise<string[] | typeof BACK_SENTINEL> {
  const knownConceptIds = Array.from(await loadKnownConceptIds()).sort((a, b) =>
    a.localeCompare(b)
  );
  if (knownConceptIds.length === 0) {
    return [];
  }

  const conceptIds = Array.from(
    new Set(
      (options.initialConceptIds ?? [])
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => parseAndValidateConceptId(entry))
    )
  );
  const knownConceptSet = new Set(knownConceptIds);

  type Step = 'initialDecision' | 'conceptEntry' | 'continueDecision' | 'done';
  type PreviousDecision = 'initialDecision' | 'continueDecision';
  let step: Step = 'initialDecision';
  let previousDecision: PreviousDecision = 'initialDecision';
  let currentIndex = 0;

  while (step !== 'done') {
    if (step === 'initialDecision') {
      const shouldAdd = await selectYesNoBack(prompt, {
        message: 'Add concept covered?',
        defaultValue: conceptIds.length > 0
      });

      if (isBackSentinel(shouldAdd)) {
        return BACK_SENTINEL;
      }
      if (!shouldAdd) {
        step = 'done';
        continue;
      }

      currentIndex = conceptIds.length;
      previousDecision = 'initialDecision';
      step = 'conceptEntry';
      continue;
    }

    if (step === 'conceptEntry') {
      const conceptInput = await inputValidatedWithBack(prompt, {
        message: 'Concept ID (normalized to snake_case): ',
        defaultValue: conceptIds[currentIndex],
        validate: (value) =>
          value.trim().length === 0 ? 'concept_id is required' : undefined
      });

      if (isBackSentinel(conceptInput)) {
        step = previousDecision;
        continue;
      }

      const conceptId = parseAndValidateConceptId(conceptInput);
      if (!knownConceptSet.has(conceptId)) {
        throw new Error(
          `Unknown concept_id '${conceptId}' not found in taxonomy concept index/files`
        );
      }

      if (currentIndex < conceptIds.length) {
        conceptIds[currentIndex] = conceptId;
      } else {
        conceptIds.push(conceptId);
      }
      step = 'continueDecision';
      continue;
    }

    const shouldContinue = await selectYesNoBack(prompt, {
      message: 'Add another concept covered?',
      defaultValue: false
    });

    if (isBackSentinel(shouldContinue)) {
      if (conceptIds.length === 0) {
        step = 'initialDecision';
        continue;
      }
      currentIndex = conceptIds.length - 1;
      previousDecision = 'continueDecision';
      step = 'conceptEntry';
      continue;
    }

    if (shouldContinue) {
      currentIndex = conceptIds.length;
      previousDecision = 'continueDecision';
      step = 'conceptEntry';
      continue;
    }

    step = 'done';
  }

  return Array.from(new Set(conceptIds)).sort((a, b) => a.localeCompare(b));
}
