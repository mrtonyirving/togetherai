import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCliOptionMap } from '../lib/scaffold/cli.js';

test('parseCliOptionMap parses valid --key value pairs', () => {
  const parsed = parseCliOptionMap([
    '--slug', 'sample',
    '--decision-type', 'warning',
    '--fine', 'no'
  ]);

  assert.equal(parsed.get('slug'), 'sample');
  assert.equal(parsed.get('decision-type'), 'warning');
  assert.equal(parsed.get('fine'), 'no');
  assert.equal(parsed.size, 3);
});

test('parseCliOptionMap rejects tokens without -- prefix', () => {
  assert.throws(
    () => parseCliOptionMap(['slug', 'sample']),
    /Unexpected argument 'slug'/
  );
});

test('parseCliOptionMap rejects missing option values', () => {
  assert.throws(
    () => parseCliOptionMap(['--slug']),
    /Missing value for option '--slug'/
  );
});

test('parseCliOptionMap rejects empty option names', () => {
  assert.throws(
    () => parseCliOptionMap(['--', 'sample']),
    /Invalid option '--'/
  );
});
