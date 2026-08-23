#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  compareNumericVersions,
  parseReleaseZipName,
  selectLatestReleaseZip,
} from './lib/release-zip-selection.mjs';

const unsorted = [
  'notes.txt',
  'ox-alpha-snake-test-v0.2.0-debug.zip',
  'ox-alpha-snake-test-v0.2.1-marketing.zip',
  'ox-alpha-snake-test-v0.2.0.zip',
  'ox-alpha-snake-test-v0.2.1-debug.zip',
  'ox-alpha-snake-test-v0.2.1.zip',
];

assert.equal(
  selectLatestReleaseZip(unsorted, 'debug'),
  'ox-alpha-snake-test-v0.2.1-debug.zip',
  'debug runtime must not test the first/oldest directory entry',
);
assert.equal(
  selectLatestReleaseZip(unsorted, 'marketing'),
  'ox-alpha-snake-test-v0.2.1-marketing.zip',
  'marketing selection must be exact',
);
assert.equal(
  selectLatestReleaseZip(unsorted, 'production'),
  'ox-alpha-snake-test-v0.2.1.zip',
  'production must not select a debug or marketing archive',
);

const numericOrdering = [
  'demo-v1.10.0.zip',
  'demo-v1.9.9.zip',
  'demo-v1.2.100.zip',
];
assert.equal(selectLatestReleaseZip(numericOrdering, 'production'), 'demo-v1.10.0.zip');
assert.equal(compareNumericVersions([1, 10, 0], [1, 9, 9]) > 0, true);
assert.equal(compareNumericVersions([1, 2], [1, 2, 0]), 0);

assert.deepEqual(parseReleaseZipName('factory-v12.4-debug.zip'), {
  fileName: 'factory-v12.4-debug.zip',
  project: 'factory',
  version: [12, 4],
  variant: 'debug',
});
assert.equal(parseReleaseZipName('factory-v1.2-debug.tar'), null);
assert.equal(selectLatestReleaseZip(['readme.md'], 'debug'), null);
assert.throws(() => selectLatestReleaseZip(unsorted, 'preview'), /Unsupported release variant/);

console.log('[OK] runtime release ZIP selection uses the newest exact variant.');
