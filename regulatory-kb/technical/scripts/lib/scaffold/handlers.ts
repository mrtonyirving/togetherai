import fs from 'fs-extra';
import path from 'node:path';

import {
  BACK_SENTINEL,
  checkboxWithBack,
  inputValidatedWithBack,
  isBackSentinel,
  selectOptionalNumberOrCustomWithBack,
  selectOrCustomWithBack,
  type PromptAdapter,
  type SelectChoice
} from '../cli_prompts.js';
import {
  extractLawCodeCandidates,
  findJurisdictionCatalog,
  findLawCatalog,
  getParagraphNumbers,
  getPunktNumbers,
  getStyckeNumbers,
  type LawCatalog,
  type ScaffoldCatalog
} from '../scaffold_catalog.js';
import { toPosixRelative } from '../io.js';
import {
  ensureNode,
  readConceptIndex,
  readEnforcementActionIndex,
  readJurisdictionIndex,
  writeConceptIndex,
  writeEnforcementActionIndex,
  writeJurisdictionIndex
} from './indexes.js';
import {
  conceptFileRef,
  enforcementActionFileRef,
  indexConceptsPath,
  indexEnforcementActionsPath,
  indexJurisdictionPath,
  subconceptFileRef
} from './paths.js';
import {
  ensureProvisionFile,
  levelName,
  provisionHierarchyFromAddress
} from './provision_files.js';
import {
  buildEnforcementReferenceId,
  dedupeAndSort,
  extractAddressesFromReferenceBody,
  formatStructuredConceptReferences,
  normalizeDiarienummer,
  normalizeJurisdiction,
  parseAndValidateConceptId,
  parseAndValidateConceptSlug,
  parseCsv,
  toProvisionAddress,
  parseRequiredPositiveIntegerComponent,
  SWEDEN_LAW_DEFAULT,
  toConceptId,
  validateDecisionType,
  validateFineFlag
} from './references.js';
import {
  loadKnownConceptIds,
  promptConceptsCoveredWithBack,
  promptLawCodeWithBack,
  promptStatutoryReferencesWithBack
} from './prompts.js';
import type { DecisionType } from './types.js';
import { DECISION_TYPES } from './types.js';
import { parseCanonicalReference } from '../reference_contract.js';

function mergeReferencesIntoConceptFile(existing: string, newAddresses: string[]): string {
  const refHeading = '## references';
  const refIndex = existing.indexOf(refHeading);
  if (refIndex === -1) {
    return existing;
  }

  const afterHeading = refIndex + refHeading.length;
  const nextSectionMatch = existing.slice(afterHeading).search(/^## /m);
  const refBodyEnd = nextSectionMatch === -1
    ? existing.length
    : afterHeading + nextSectionMatch;

  const refBody = existing.slice(afterHeading, refBodyEnd);
  const existingAddresses = extractAddressesFromReferenceBody(refBody);
  const merged = dedupeAndSort([...existingAddresses, ...newAddresses]);

  const formattedLines = formatStructuredConceptReferences(merged);
  const newRefSection = formattedLines.length > 0
    ? `${refHeading}\n${formattedLines.join('\n')}\n\n`
    : `${refHeading}\n\n`;

  return existing.slice(0, refIndex) + newRefSection + existing.slice(refBodyEnd);
}

export async function scaffoldConcept(
  prompt: PromptAdapter,
  catalog: ScaffoldCatalog
): Promise<void> {
  const noParent = '__none__' as const;
  const customParent = '__custom__' as const;
  type ParentSelection = string | typeof noParent | typeof customParent;
  type Step = 'slug' | 'parentSelection' | 'parentCustom' | 'references' | 'done';

  let step: Step = 'slug';
  let slug = '';
  let parentSelection: ParentSelection = noParent;
  let parentSlug = '';
  let references: string[] = [];
  let referencesBackStep: 'parentSelection' | 'parentCustom' = 'parentSelection';

  while (step !== 'done') {
    if (step === 'slug') {
      const slugResult = await selectOrCustomWithBack(prompt, {
        message: 'Concept slug/name (normalized to snake_case):',
        options: catalog.conceptSlugs,
        customInputMessage: 'Concept slug/name: ',
        customLabel: 'Custom concept slug...',
        validateCustom: (value) =>
          value.trim().length === 0 ? 'Concept slug is required' : undefined,
        defaultValue: slug
      });

      if (isBackSentinel(slugResult)) {
        continue;
      }
      slug = parseAndValidateConceptSlug(slugResult);
      step = 'parentSelection';
      continue;
    }

    if (step === 'parentSelection') {
      const parentChoices: Array<
        SelectChoice<ParentSelection | typeof BACK_SENTINEL>
      > = [
        { name: 'None', value: noParent },
        ...catalog.conceptSlugs.map((conceptSlug) => ({
          name: conceptSlug,
          value: conceptSlug
        })),
        { name: 'Custom parent...', value: customParent },
        { name: 'Back', value: BACK_SENTINEL }
      ];

      const defaultParentSelection: ParentSelection =
        parentSelection === customParent
          ? customParent
          : parentSlug
            ? catalog.conceptSlugs.includes(parentSlug)
              ? parentSlug
              : customParent
            : noParent;

      const selectedParent = await prompt.select({
        message: 'Parent concept slug (optional, for subconcept):',
        choices: parentChoices,
        pageSize: 12,
        defaultValue: defaultParentSelection
      });

      if (isBackSentinel(selectedParent)) {
        step = 'slug';
        continue;
      }
      parentSelection = selectedParent;

      if (selectedParent === customParent) {
        referencesBackStep = 'parentCustom';
        step = 'parentCustom';
      } else {
        parentSlug =
          selectedParent === noParent
            ? ''
            : parseAndValidateConceptSlug(selectedParent);
        referencesBackStep = 'parentSelection';
        step = 'references';
      }
      continue;
    }

    if (step === 'parentCustom') {
      const parentResult = await inputValidatedWithBack(prompt, {
        message: 'Parent concept slug/name (normalized to snake_case): ',
        defaultValue: parentSlug || undefined,
        validate: (value) =>
          value.trim().length === 0
            ? 'Parent concept slug is required'
            : undefined
      });

      if (isBackSentinel(parentResult)) {
        step = 'parentSelection';
        continue;
      }

      parentSelection = customParent;
      parentSlug = parseAndValidateConceptSlug(parentResult);
      referencesBackStep = 'parentCustom';
      step = 'references';
      continue;
    }

    const referenceResult = await promptStatutoryReferencesWithBack(prompt, catalog, {
      firstQuestion: 'Add statutory reference now?',
      requireAtLeastOne: false,
      initialAddresses: references
    });

    if (isBackSentinel(referenceResult)) {
      step = referencesBackStep;
      continue;
    }

    references = referenceResult;
    step = 'done';
  }

  if (!slug) {
    throw new Error('Concept slug is required');
  }

  const conceptId = toConceptId(slug);
  const kind = parentSlug ? 'subconcept' : 'concept';
  const parentConceptId = parentSlug ? toConceptId(parentSlug) : undefined;

  const concepts = await readConceptIndex();
  const normalizedTarget = parentSlug || slug;
  const normalizeIndexName = (value: string): string | undefined => {
    try {
      return parseAndValidateConceptSlug(value);
    } catch {
      return undefined;
    }
  };

  let parentEntry = concepts.find(
    (entry) => normalizeIndexName(entry.name) === normalizedTarget
  );

  if (!parentSlug) {
    if (!parentEntry) {
      concepts.push({
        name: slug,
        file: conceptFileRef(slug),
        subconcepts: []
      });
    } else {
      parentEntry.name = slug;
      parentEntry.file = conceptFileRef(slug);
    }
  } else {
    if (!parentEntry) {
      parentEntry = {
        name: parentSlug,
        file: conceptFileRef(parentSlug),
        subconcepts: []
      };
      concepts.push(parentEntry);
    } else {
      parentEntry.name = parentSlug;
      parentEntry.file = conceptFileRef(parentSlug);
    }

    const existingSubconcept = parentEntry.subconcepts.find(
      (entry) => normalizeIndexName(entry.name) === slug
    );
    if (!existingSubconcept) {
      parentEntry.subconcepts.push({
        name: slug,
        file: subconceptFileRef(parentSlug, slug)
      });
    } else {
      existingSubconcept.name = slug;
      existingSubconcept.file = subconceptFileRef(parentSlug, slug);
    }
  }

  await writeConceptIndex(concepts);

  const conceptDir = parentSlug
    ? path.join(
        process.cwd(),
        'library',
        'taxonomy',
        'AML',
        'concepts',
        parentSlug,
        'subconcepts',
        slug
      )
    : path.join(process.cwd(), 'library', 'taxonomy', 'AML', 'concepts', slug);

  await fs.ensureDir(conceptDir);
  const conceptFile = path.join(conceptDir, `${slug}.md`);

  const existing = (await fs.pathExists(conceptFile))
    ? await fs.readFile(conceptFile, 'utf8')
    : '';
  if (existing.trim().length === 0) {
    const content = [
      `# ${conceptId}`,
      '',
      '## metadata',
      `- concept_id: ${conceptId}`,
      `- concept_slug: ${slug}`,
      `- kind: ${kind}`,
      ...(parentConceptId ? [`- parent_concept_id: ${parentConceptId}`] : []),
      '',
      '## references',
      ...formatStructuredConceptReferences(references),
      ...(kind === 'concept' ? ['', '## subconcepts'] : []),
      ''
    ].join('\n');

    await fs.writeFile(conceptFile, content, 'utf8');
  } else if (references.length > 0) {
    const updated = mergeReferencesIntoConceptFile(existing, references);
    if (updated !== existing) {
      await fs.writeFile(conceptFile, updated, 'utf8');
    }
  }

  console.log(`Updated ${toPosixRelative(indexConceptsPath())}`);
  console.log(`Ensured ${toPosixRelative(conceptFile)}`);
}

export async function scaffoldProvision(
  prompt: PromptAdapter,
  catalog: ScaffoldCatalog
): Promise<void> {
  const swedenCatalog = findJurisdictionCatalog(catalog, 'Sweden');
  const swedenLaws = swedenCatalog?.laws ?? [];
  const lawChoices = toLawChoiceMap(swedenLaws);
  const topicChoices = dedupeAndSort(
    catalog.conceptSlugs.map((conceptSlug) => toConceptId(conceptSlug))
  );

  type Step =
    | 'lawName'
    | 'lawCode'
    | 'chapter'
    | 'paragraph'
    | 'stycke'
    | 'punkt'
    | 'topics'
    | 'customTopics'
    | 'done';

  let step: Step = 'lawName';
  let lawSelection = '';
  let selectedLawCatalog: LawCatalog | undefined;
  let lawName = '';
  let lawCode = '';
  let chapter: number | undefined;
  let paragraph: number | undefined;
  let stycke: number | undefined;
  let punkt: number | undefined;
  let selectedTopics: string[] = [];
  let customTopicsInput = '';
  let stepBeforeTopics: 'paragraph' | 'stycke' | 'punkt' = 'paragraph';

  while (step !== 'done') {
    if (step === 'lawName') {
      if (lawChoices.size > 0) {
        const lawResult = await selectOrCustomWithBack(prompt, {
          message: 'Law display name:',
          options: [...lawChoices.keys()],
          customInputMessage: 'Law display name: ',
          customLabel: 'Custom law...',
          validateCustom: (value) =>
            value.trim().length === 0 ? 'Law display name is required' : undefined,
          defaultValue: lawSelection || lawName || undefined
        });

        if (isBackSentinel(lawResult)) {
          continue;
        }

        const previousLawName = lawName;
        lawSelection = lawResult;
        selectedLawCatalog = lawChoices.get(lawResult);
        lawName = selectedLawCatalog?.name ?? lawResult.trim();

        if (previousLawName && previousLawName !== lawName) {
          lawCode = '';
          chapter = undefined;
          paragraph = undefined;
          stycke = undefined;
          punkt = undefined;
        }
      } else {
        const lawResult = await inputValidatedWithBack(prompt, {
          message: `Law display name [${SWEDEN_LAW_DEFAULT}]: `,
          defaultValue: lawName || SWEDEN_LAW_DEFAULT,
          validate: (value) =>
            value.trim().length === 0 ? 'Law display name is required' : undefined
        });

        if (isBackSentinel(lawResult)) {
          continue;
        }

        const previousLawName = lawName;
        lawName = lawResult;
        lawSelection = lawResult;
        selectedLawCatalog = findLawCatalog(swedenCatalog, lawName);
        if (previousLawName && previousLawName !== lawName) {
          lawCode = '';
          chapter = undefined;
          paragraph = undefined;
          stycke = undefined;
          punkt = undefined;
        }
      }

      step = 'lawCode';
      continue;
    }

    if (step === 'lawCode') {
      const lawCodeResult = await promptLawCodeWithBack(
        prompt,
        [
          ...extractLawCodeCandidates(lawName),
          ...(selectedLawCatalog?.lawCodeCandidates ?? [])
        ],
        {
          message: 'Law code:',
          customInputMessage: 'Law code (e.g. 2017:630): ',
          defaultValue: lawCode || undefined
        }
      );

      if (isBackSentinel(lawCodeResult)) {
        step = 'lawName';
        continue;
      }

      if (lawCode && lawCode !== lawCodeResult) {
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
        message: 'Chapter number:',
        existingValues: selectedLawCatalog?.chapterNumbers ?? [],
        required: true,
        parseCustom: (value) =>
          parseRequiredPositiveIntegerComponent(value, 'Chapter', 'k'),
        customInputMessage: 'Chapter number: ',
        defaultValue: chapter
      });

      if (isBackSentinel(chapterResult)) {
        step = 'lawCode';
        continue;
      }
      if (chapterResult === undefined) {
        throw new Error('Chapter number must be a positive integer');
      }

      if (chapter !== chapterResult) {
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
        throw new Error('Chapter number must be a positive integer');
      }

      const paragraphResult = await selectOptionalNumberOrCustomWithBack(prompt, {
        message: 'Paragraph number (optional):',
        existingValues: getParagraphNumbers(selectedLawCatalog, chapter),
        parseCustom: (value) =>
          parseRequiredPositiveIntegerComponent(value, 'Paragraph', 'p'),
        customInputMessage: 'Paragraph number (optional): ',
        defaultValue: paragraph
      });

      if (isBackSentinel(paragraphResult)) {
        step = 'chapter';
        continue;
      }

      if (paragraph !== paragraphResult) {
        stycke = undefined;
        punkt = undefined;
      }
      paragraph = paragraphResult;
      if (paragraph === undefined) {
        stycke = undefined;
        punkt = undefined;
        stepBeforeTopics = 'paragraph';
        step = 'topics';
      } else {
        step = 'stycke';
      }
      continue;
    }

    if (step === 'stycke') {
      if (chapter === undefined || paragraph === undefined) {
        stepBeforeTopics = 'paragraph';
        step = 'topics';
        continue;
      }

      const styckeResult = await selectOptionalNumberOrCustomWithBack(prompt, {
        message: 'Stycke number (optional):',
        existingValues: getStyckeNumbers(selectedLawCatalog, chapter, paragraph),
        parseCustom: (value) =>
          parseRequiredPositiveIntegerComponent(value, 'Stycke', 's'),
        customInputMessage: 'Stycke number (optional): ',
        defaultValue: stycke
      });

      if (isBackSentinel(styckeResult)) {
        step = 'paragraph';
        continue;
      }

      if (stycke !== styckeResult) {
        punkt = undefined;
      }
      stycke = styckeResult;
      if (stycke === undefined) {
        punkt = undefined;
        stepBeforeTopics = 'stycke';
        step = 'topics';
      } else {
        step = 'punkt';
      }
      continue;
    }

    if (step === 'punkt') {
      if (chapter === undefined || paragraph === undefined || stycke === undefined) {
        stepBeforeTopics = 'stycke';
        step = 'topics';
        continue;
      }

      const punktResult = await selectOptionalNumberOrCustomWithBack(prompt, {
        message: 'Punkt number (optional):',
        existingValues: getPunktNumbers(selectedLawCatalog, chapter, paragraph, stycke),
        parseCustom: (value) =>
          parseRequiredPositiveIntegerComponent(value, 'Punkt', 'pt'),
        customInputMessage: 'Punkt number (optional): ',
        defaultValue: punkt
      });

      if (isBackSentinel(punktResult)) {
        step = 'stycke';
        continue;
      }

      punkt = punktResult;
      stepBeforeTopics = 'punkt';
      step = 'topics';
      continue;
    }

    if (step === 'topics') {
      if (topicChoices.length > 0) {
        const topicResult = await checkboxWithBack(prompt, {
          message: 'Topics (existing Concept IDs):',
          choices: topicChoices.map((conceptId) => ({
            name: conceptId,
            value: conceptId,
            checked: selectedTopics.includes(conceptId)
          })),
          pageSize: 12
        });

        if (isBackSentinel(topicResult)) {
          step = stepBeforeTopics;
          continue;
        }
        selectedTopics = topicResult;
      } else {
        selectedTopics = [];
      }

      step = 'customTopics';
      continue;
    }

    const customTopicsResult = await inputValidatedWithBack(prompt, {
      message: 'Additional Concept IDs for topics (comma-separated, optional): ',
      defaultValue: customTopicsInput || undefined
    });

    if (isBackSentinel(customTopicsResult)) {
      step = topicChoices.length > 0 ? 'topics' : stepBeforeTopics;
      continue;
    }

    customTopicsInput = customTopicsResult;
    step = 'done';
  }

  if (!lawName || !lawCode || chapter === undefined) {
    throw new Error('Law display name, law code, and chapter are required');
  }

  const customTopics = parseCsv(customTopicsInput);
  const topics = dedupeAndSort(
    [...selectedTopics, ...customTopics].map((topic) =>
      parseAndValidateConceptId(topic)
    )
  );

  const jurisdictions = await readJurisdictionIndex();
  let sweden = jurisdictions.find((entry) => entry.name === 'Sweden');
  if (!sweden) {
    sweden = { name: 'Sweden', laws: [] };
    jurisdictions.push(sweden);
  }

  let law = sweden.laws.find((entry) => entry.name === lawName);
  if (!law) {
    law = { name: lawName, provisions: [] };
    sweden.laws.push(law);
  }

  const level1 = ensureNode(law.provisions, 1, levelName(1, chapter));
  let current = level1;
  if (paragraph !== undefined) {
    current = ensureNode(current.children, 2, levelName(2, paragraph));
  }
  if (stycke !== undefined) {
    current = ensureNode(current.children, 3, levelName(3, stycke));
  }
  if (punkt !== undefined) {
    current = ensureNode(current.children, 4, levelName(4, punkt));
  }

  void current;

  await writeJurisdictionIndex(jurisdictions);

  const address = toProvisionAddress(lawCode, chapter, paragraph, stycke, punkt);
  const filePath = await ensureProvisionFile(
    {
      address,
      lawName,
      jurisdictionName: 'Sweden',
      topics
    }
  );
  console.log(`Updated ${toPosixRelative(indexJurisdictionPath())}`);
  console.log(`Ensured ${toPosixRelative(filePath)}`);
}

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

export async function validateConceptIdsExist(conceptIds: string[]): Promise<string[]> {
  const normalized = dedupeAndSort(
    conceptIds.map((value) => parseAndValidateConceptId(value))
  );
  const knownConceptIds = await loadKnownConceptIds();
  for (const conceptId of normalized) {
    if (!knownConceptIds.has(conceptId)) {
      throw new Error(
        `Unknown concept_id '${conceptId}' not found in taxonomy concept index/files`
      );
    }
  }
  return normalized;
}

function resolveLawNameForHierarchy(
  jurisdictionName: string,
  lawIdentifier: string,
  existingLawNames: string[]
): string {
  if (jurisdictionName !== 'Sweden') {
    return lawIdentifier;
  }

  const existing = existingLawNames.find(
    (lawName) => lawName === lawIdentifier || lawName.includes(lawIdentifier)
  );
  return existing ?? lawIdentifier;
}

function upsertJurisdictionHierarchyForAddress(
  jurisdictions: Awaited<ReturnType<typeof readJurisdictionIndex>>,
  address: string
): {
  jurisdictionName: string;
  lawName: string;
} {
  const hierarchy = provisionHierarchyFromAddress(address);
  let jurisdiction = jurisdictions.find((entry) => entry.name === hierarchy.jurisdictionName);
  if (!jurisdiction) {
    jurisdiction = { name: hierarchy.jurisdictionName, laws: [] };
    jurisdictions.push(jurisdiction);
  }

  const lawName = resolveLawNameForHierarchy(
    hierarchy.jurisdictionName,
    hierarchy.lawName,
    jurisdiction.laws.map((law) => law.name)
  );

  let law = jurisdiction.laws.find((entry) => entry.name === lawName);
  if (!law) {
    law = { name: lawName, provisions: [] };
    jurisdiction.laws.push(law);
  }

  let children = law.provisions;
  for (const node of hierarchy.nodes) {
    const ensured = ensureNode(children, node.level, node.name);
    children = ensured.children;
  }

  return { jurisdictionName: hierarchy.jurisdictionName, lawName };
}

async function writeEnforcementActionScaffold(input: {
  slug: string;
  jurisdiction: 'SE';
  diarienummer: string;
  referenceTail: string;
  entityName: string;
  entityType: string;
  decisionType: DecisionType;
  fine: 'yes' | 'no';
  fineAmount?: number;
  currency?: string;
  conceptsCovered: string[];
  addresses: string[];
}): Promise<void> {
  const {
    slug,
    jurisdiction,
    diarienummer,
    referenceTail,
    entityName,
    entityType,
    decisionType,
    fine,
    fineAmount,
    currency,
    conceptsCovered,
    addresses
  } = input;
  if (!slug || !diarienummer || !entityName) {
    throw new Error(
      'slug, jurisdiction, diarienummer, and affected_entity_name are required'
    );
  }

  const referenceId = buildEnforcementReferenceId(jurisdiction, referenceTail);
  const canonicalAddresses = dedupeAndSort(
    addresses.map((address) =>
      parseCanonicalReference(address, 'enforcement statutory reference').canonical
    )
  );

  const outDir = path.join(
    process.cwd(),
    'library',
    'ontologies',
    'document-types',
    'enforcement-actions',
    'jurisdictions',
    'se',
    'examples',
    'enforcement-actions'
  );
  await fs.ensureDir(outDir);

  if (canonicalAddresses.length > 0) {
    const jurisdictions = await readJurisdictionIndex();
    for (const address of canonicalAddresses) {
      const target = upsertJurisdictionHierarchyForAddress(jurisdictions, address);
      await ensureProvisionFile({
        address,
        jurisdictionName: target.jurisdictionName,
        lawName: target.lawName,
        topics: []
      });
    }

    await writeJurisdictionIndex(jurisdictions);
    console.log(`Updated ${toPosixRelative(indexJurisdictionPath())}`);
  }

  const sections: string[] = [
    `# Sweden Enforcement Action ${slug}`,
    '',
    '## record',
    `- reference_id: ${referenceId}`,
    `- diarienummer: ${diarienummer}`,
    '- regulatory_authority: Finansinspektionen',
    `- affected_entity_name: ${entityName}`,
    `- entity_type: ${entityType}`,
    `- decision_type: ${decisionType}`,
    `- fine: ${fine}`,
    ...(fine === 'yes'
      ? [`- fine_amount: ${fineAmount}`, `- currency: ${currency}`]
      : []),
    '',
    '## concepts_covered',
    '',
    '## statutory_references',
    ''
  ];

  conceptsCovered.forEach((conceptId, index) => {
    sections.push(`### concept_${index + 1}`);
    sections.push(`- concept_id: ${conceptId}`);
    sections.push('');
  });

  if (canonicalAddresses.length === 0) {
    console.warn(
      [
        'WARNING: Scaffold created enforcement action without statutory references.',
        'Downstream inference commands will fail until at least one statutory reference is added.',
        "Add at least one '### ref_N' block under '## statutory_references' in the generated file."
      ].join('\n')
    );
  }

  sections.push(...formatStructuredConceptReferences(canonicalAddresses));

  const filePath = path.join(outDir, `${slug}.md`);
  await fs.writeFile(filePath, `${sections.join('\n')}\n`, 'utf8');

  const indexEntries = await readEnforcementActionIndex();
  const existingEntry = indexEntries.find((entry) => entry.name === slug);
  if (existingEntry) {
    existingEntry.file = enforcementActionFileRef(slug);
  } else {
    indexEntries.push({
      name: slug,
      file: enforcementActionFileRef(slug)
    });
  }
  await writeEnforcementActionIndex(indexEntries);

  console.log(`Updated ${toPosixRelative(indexEnforcementActionsPath())}`);
  console.log(`Ensured ${toPosixRelative(filePath)}`);
}

export async function scaffoldEnforcementAction(
  prompt: PromptAdapter,
  catalog: ScaffoldCatalog
): Promise<void> {
  type Step =
    | 'slug'
    | 'jurisdiction'
    | 'diarienummer'
    | 'entityName'
    | 'entityType'
    | 'decisionType'
    | 'fine'
    | 'fineAmount'
    | 'currency'
    | 'concepts'
    | 'references'
    | 'done';

  let step: Step = 'slug';
  let slug = '';
  let jurisdictionInput = 'Sweden';
  let jurisdiction: 'SE' | undefined;
  let diarienummerInput = '';
  let diarienummer = '';
  let referenceTail = '';
  let entityName = '';
  let entityType = '';
  let decisionType: DecisionType | undefined;
  let fine: 'yes' | 'no' | undefined;
  let fineAmountInput = '';
  let fineAmount: number | undefined;
  let currency: string | undefined;
  let conceptsCovered: string[] = [];
  let addresses: string[] = [];

  while (step !== 'done') {
    if (step === 'slug') {
      const slugResult = await inputValidatedWithBack(prompt, {
        message: 'Enforcement file slug (without .md): ',
        defaultValue: slug || undefined,
        validate: (value) => (value.trim().length === 0 ? 'slug is required' : undefined)
      });

      if (isBackSentinel(slugResult)) {
        continue;
      }
      slug = slugResult;
      step = 'jurisdiction';
      continue;
    }

    if (step === 'jurisdiction') {
      const jurisdictionResult = await inputValidatedWithBack(prompt, {
        message: 'Jurisdiction [Sweden]: ',
        defaultValue: jurisdictionInput || 'Sweden',
        validate: (value) => {
          try {
            normalizeJurisdiction(value);
            return undefined;
          } catch (error) {
            return error instanceof Error ? error.message : String(error);
          }
        }
      });

      if (isBackSentinel(jurisdictionResult)) {
        step = 'slug';
        continue;
      }

      jurisdictionInput = jurisdictionResult;
      jurisdiction = normalizeJurisdiction(jurisdictionResult);
      step = 'diarienummer';
      continue;
    }

    if (step === 'diarienummer') {
      const diarienummerResult = await inputValidatedWithBack(prompt, {
        message: 'diarienummer (e.g. 23-13249): ',
        defaultValue: diarienummerInput || undefined,
        validate: (value) => {
          try {
            normalizeDiarienummer(value);
            return undefined;
          } catch (error) {
            return error instanceof Error ? error.message : String(error);
          }
        }
      });

      if (isBackSentinel(diarienummerResult)) {
        step = 'jurisdiction';
        continue;
      }

      diarienummerInput = diarienummerResult;
      const normalized = normalizeDiarienummer(diarienummerResult);
      diarienummer = normalized.diarienummer;
      referenceTail = normalized.referenceTail;
      step = 'entityName';
      continue;
    }

    if (step === 'entityName') {
      const entityNameResult = await inputValidatedWithBack(prompt, {
        message: 'affected_entity_name: ',
        defaultValue: entityName || undefined,
        validate: (value) =>
          value.trim().length === 0 ? 'affected_entity_name is required' : undefined
      });

      if (isBackSentinel(entityNameResult)) {
        step = 'diarienummer';
        continue;
      }

      entityName = entityNameResult;
      step = 'entityType';
      continue;
    }

    if (step === 'entityType') {
      const entityTypeResult = await inputValidatedWithBack(prompt, {
        message: 'entity_type: ',
        defaultValue: entityType || undefined,
        validate: (value) =>
          value.trim().length === 0 ? 'entity_type is required' : undefined
      });

      if (isBackSentinel(entityTypeResult)) {
        step = 'entityName';
        continue;
      }

      entityType = entityTypeResult;
      step = 'decisionType';
      continue;
    }

    if (step === 'decisionType') {
      const decisionTypeResult = await prompt.select({
        message: 'decision_type:',
        choices: [
          ...DECISION_TYPES.map((dt) => ({ name: dt, value: dt })),
          { name: 'Back', value: BACK_SENTINEL }
        ],
        defaultValue: decisionType
      });

      if (isBackSentinel(decisionTypeResult)) {
        step = 'entityType';
        continue;
      }

      decisionType = validateDecisionType(decisionTypeResult);
      step = 'fine';
      continue;
    }

    if (step === 'fine') {
      const fineResult = await prompt.select({
        message: 'fine:',
        choices: [
          { name: 'yes', value: 'yes' as const },
          { name: 'no', value: 'no' as const },
          { name: 'Back', value: BACK_SENTINEL }
        ],
        defaultValue: fine
      });

      if (isBackSentinel(fineResult)) {
        step = 'decisionType';
        continue;
      }

      const normalizedFine = validateFineFlag(fineResult);
      if (fine === 'yes' && normalizedFine === 'no') {
        fineAmountInput = '';
        fineAmount = undefined;
        currency = undefined;
      }

      fine = normalizedFine;
      step = fine === 'yes' ? 'fineAmount' : 'concepts';
      continue;
    }

    if (step === 'fineAmount') {
      const fineAmountResult = await inputValidatedWithBack(prompt, {
        message: 'fine_amount: ',
        defaultValue: fineAmountInput || (fineAmount !== undefined ? String(fineAmount) : undefined),
        validate: (value) => {
          const num = Number(value.trim());
          if (!Number.isFinite(num) || num <= 0) {
            return 'fine_amount must be a positive number';
          }
          return undefined;
        }
      });

      if (isBackSentinel(fineAmountResult)) {
        step = 'fine';
        continue;
      }

      fineAmountInput = fineAmountResult;
      fineAmount = Number(fineAmountResult.trim());
      step = 'currency';
      continue;
    }

    if (step === 'currency') {
      const currencyResult = await inputValidatedWithBack(prompt, {
        message: 'currency (ISO 4217, e.g. SEK): ',
        defaultValue: currency ?? 'SEK',
        validate: (value) =>
          value.trim().length === 0 ? 'currency is required when fine=yes' : undefined
      });

      if (isBackSentinel(currencyResult)) {
        step = 'fineAmount';
        continue;
      }

      currency = currencyResult;
      step = 'concepts';
      continue;
    }

    if (step === 'concepts') {
      const conceptResult = await promptConceptsCoveredWithBack(prompt, {
        initialConceptIds: conceptsCovered
      });

      if (isBackSentinel(conceptResult)) {
        step = fine === 'yes' ? 'currency' : 'fine';
        continue;
      }

      conceptsCovered = conceptResult;
      step = 'references';
      continue;
    }

    const referenceResult = await promptStatutoryReferencesWithBack(prompt, catalog, {
      firstQuestion: 'Add statutory reference?',
      requireAtLeastOne: false,
      requireParagraph: false,
      initialAddresses: addresses
    });

    if (isBackSentinel(referenceResult)) {
      step = 'concepts';
      continue;
    }

    addresses = referenceResult;
    step = 'done';
  }

  if (!slug || !jurisdiction || !diarienummer || !referenceTail || !entityName || !entityType) {
    throw new Error(
      'slug, jurisdiction, diarienummer, and affected_entity_name are required'
    );
  }
  if (!decisionType || !fine) {
    throw new Error('decision_type and fine are required');
  }
  if (fine === 'yes' && (fineAmount === undefined || currency === undefined)) {
    throw new Error('fine_amount and currency are required when fine=yes');
  }

  await writeEnforcementActionScaffold({
    slug,
    jurisdiction,
    diarienummer,
    referenceTail,
    entityName,
    entityType,
    decisionType,
    fine,
    fineAmount,
    currency,
    conceptsCovered,
    addresses
  });
}

export async function scaffoldEnforcementActionFromCliOptions(
  options: Map<string, string>
): Promise<void> {
  const allowed = new Set([
    'slug',
    'jurisdiction',
    'diarienummer',
    'affected-entity-name',
    'entity-type',
    'decision-type',
    'fine',
    'fine-amount',
    'currency',
    'concepts-covered',
    'statutory-references'
  ]);
  for (const key of options.keys()) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown option '--${key}' for enforcement-action`);
    }
  }

  const slug = (options.get('slug') ?? '').trim();
  if (!slug) {
    throw new Error('--slug is required for non-interactive enforcement-action scaffolding');
  }

  const jurisdiction = normalizeJurisdiction(
    (options.get('jurisdiction') ?? 'Sweden').trim() || 'Sweden'
  );
  const { diarienummer, referenceTail } = normalizeDiarienummer(
    options.get('diarienummer') ?? ''
  );

  const entityName = (options.get('affected-entity-name') ?? '').trim();
  if (!entityName) {
    throw new Error(
      '--affected-entity-name is required for non-interactive enforcement-action scaffolding'
    );
  }

  const entityType = (options.get('entity-type') ?? '').trim();
  if (!entityType) {
    throw new Error(
      '--entity-type is required for non-interactive enforcement-action scaffolding'
    );
  }

  const decisionType = validateDecisionType(options.get('decision-type') ?? '');
  const fine = validateFineFlag(options.get('fine') ?? '');

  let fineAmount: number | undefined;
  let currency: string | undefined;
  if (fine === 'yes') {
    const fineAmountRaw = (options.get('fine-amount') ?? '').trim();
    if (!fineAmountRaw) {
      throw new Error('--fine-amount is required when --fine is yes');
    }
    fineAmount = Number(fineAmountRaw);
    if (!Number.isFinite(fineAmount) || fineAmount <= 0) {
      throw new Error('--fine-amount must be a positive number');
    }
    currency = (options.get('currency') ?? 'SEK').trim();
    if (!currency) {
      throw new Error('--currency is required when --fine is yes');
    }
  }

  const conceptsCovered = await validateConceptIdsExist(
    parseCsv(options.get('concepts-covered') ?? '')
  );
  const addresses = Array.from(
    new Set(
      parseCsv(options.get('statutory-references') ?? '')
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
  const canonicalAddresses = dedupeAndSort(
    addresses.map((address) =>
      parseCanonicalReference(address, 'enforcement statutory reference').canonical
    )
  );

  await writeEnforcementActionScaffold({
    slug,
    jurisdiction,
    diarienummer,
    referenceTail,
    entityName,
    entityType,
    decisionType,
    fine,
    fineAmount,
    currency,
    conceptsCovered,
    addresses: canonicalAddresses
  });
}
