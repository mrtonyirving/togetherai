import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEnforcementReferenceId,
  dedupeAndSort,
  extractAddressesFromReferenceBody,
  formatStructuredConceptReferences,
  normalizeDiarienummer,
  normalizeJurisdiction,
  parseAndValidateConceptId,
  parseAndValidateConceptSlug,
  parseLawCode,
  parseSwedishAddress,
  toConceptId,
  toProvisionAddress,
  validateDecisionType,
  validateFineFlag
} from '../lib/scaffold/references.js';

test('toConceptId canonicalizes input to snake_case', () => {
  assert.equal(toConceptId('General Risk Assessment'), 'general_risk_assessment');
});

test('parseLawCode accepts canonical code and extracts from display names', () => {
  assert.equal(parseLawCode('2017:630'), '2017:630');
  assert.equal(
    parseLawCode('Lag (2017:630) om åtgärder mot penningtvätt'),
    '2017:630'
  );
  assert.throws(() => parseLawCode('invalid-law'), /Invalid law number/);
});

test('toProvisionAddress and parseSwedishAddress round-trip canonical values', () => {
  const address = toProvisionAddress('2017:630', 1, 2, 3, 4);
  assert.equal(address, 'SE,RD,2017:630,k1,p2,s3,pt4');

  assert.deepEqual(parseSwedishAddress(address), {
    law: '2017:630',
    chapter: 1,
    paragraph: 2,
    stycke: 3,
    punkt: 4
  });
});

test('normalizeDiarienummer and reference-id builder create SE prefix IDs', () => {
  const normalized = normalizeDiarienummer('FI 23-13249');
  assert.equal(normalized.diarienummer, 'FI 23-13249');
  assert.equal(normalized.referenceTail, '23-13249');
  assert.equal(
    buildEnforcementReferenceId('SE', normalized.referenceTail),
    'SE,FI,SB,23-13249'
  );
});

test('concept id and enforcement decision validators enforce formats', () => {
  assert.equal(parseAndValidateConceptId('general_risk_assessment'), 'general_risk_assessment');
  assert.equal(parseAndValidateConceptId('General-Risk Assessment'), 'general_risk_assessment');
  assert.throws(() => parseAndValidateConceptId('123-risk'), /Invalid concept_id/);
  assert.equal(parseAndValidateConceptSlug('PEP Topic'), 'pep_topic');

  assert.equal(validateDecisionType('warning_with_fine'), 'warning_with_fine');
  assert.throws(() => validateDecisionType('invalid'), /Invalid decision_type/);

  assert.equal(validateFineFlag('yes'), 'yes');
  assert.equal(validateFineFlag('no'), 'no');
  assert.throws(() => validateFineFlag('maybe'), /Invalid fine value/);
});

test('reference formatting de-duplicates and sorts strict ref metadata blocks', () => {
  const lines = formatStructuredConceptReferences([
    'SE,RD,2017:630,k1,p2',
    'SE,RD,2017:630,k1,p1',
    'SE,RD,2017:630,k1,p1'
  ]);

  assert.deepEqual(lines, [
    '### ref_1',
    '',
    '- jurisdiction: SE',
    '- entity: RD',
    '- law: 2017:630',
    '- level: 2',
    '- level_label: Paragraf',
    '- chapter: 1',
    '- paragraph: 1',
    '- address: SE,RD,2017:630,k1,p1',
    '',
    '### ref_2',
    '',
    '- jurisdiction: SE',
    '- entity: RD',
    '- law: 2017:630',
    '- level: 2',
    '- level_label: Paragraf',
    '- chapter: 1',
    '- paragraph: 2',
    '- address: SE,RD,2017:630,k1,p2',
    ''
  ]);
});

test('normalizeJurisdiction and dedupe helpers preserve expected canonical values', () => {
  assert.equal(normalizeJurisdiction('Sweden'), 'SE');
  assert.equal(normalizeJurisdiction('se'), 'SE');
  assert.throws(() => normalizeJurisdiction('NO'), /Unsupported jurisdiction/);

  assert.deepEqual(dedupeAndSort(['b', 'a', 'b', ' a ']), ['a', 'b']);
});

test('extractAddressesFromReferenceBody rejects legacy canonical bullet format', () => {
  const body = `
- SE,RD,2017:630,k1,p1
- SE,RD,2017:630,k1,p1,s1
`;
  assert.throws(
    () => extractAddressesFromReferenceBody(body),
    /must use '### ref_N' metadata blocks/
  );
});

test('extractAddressesFromReferenceBody rejects legacy structured concept format', () => {
  const body = `
Sweden:
Law: 2017:630
Kapitel: 2

Sweden:
Law: 2017:630
Kapitel: 3
Paragraph: p1
`;
  assert.throws(
    () => extractAddressesFromReferenceBody(body),
    /must use '### ref_N' metadata blocks/
  );
});

test('extractAddressesFromReferenceBody parses strict metadata block references', () => {
  const body = `
### ref_1

- jurisdiction: SE
- entity: RD
- law: 2017:630
- level: 1
- level_label: Kapitel
- chapter: 2
- address: SE,RD,2017:630,k2

### ref_2

- jurisdiction: SE
- entity: RD
- law: 2017:630
- level: 2
- level_label: Paragraf
- chapter: 3
- paragraph: 1
- address: SE,RD,2017:630,k3,p1
`;
  assert.deepEqual(extractAddressesFromReferenceBody(body), [
    'SE,RD,2017:630,k2',
    'SE,RD,2017:630,k3,p1'
  ]);
});

test('extractAddressesFromReferenceBody returns empty for empty body', () => {
  assert.deepEqual(extractAddressesFromReferenceBody(''), []);
  assert.deepEqual(extractAddressesFromReferenceBody('\n\n'), []);
});
