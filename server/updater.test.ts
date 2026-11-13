import assert from 'node:assert/strict';
import test from 'node:test';
import { compareSemver, normalizeGitHubRepo, validateBranchName } from './updater.ts';

test('normalizeGitHubRepo accepts owner/repo and GitHub URLs while rejecting invalid inputs', () => {
  assert.equal(normalizeGitHubRepo('avaya-ops/avaya-cdr'), 'avaya-ops/avaya-cdr');
  assert.equal(
    normalizeGitHubRepo('https://github.com/avaya-ops/avaya-cdr.git'),
    'avaya-ops/avaya-cdr'
  );
  assert.equal(normalizeGitHubRepo('git@github.com:avaya-ops/avaya-cdr.git'), 'avaya-ops/avaya-cdr');
  assert.equal(normalizeGitHubRepo('  '), '');

  assert.throws(() => normalizeGitHubRepo('https://evil.example.com/foo/bar'));
  assert.throws(() => normalizeGitHubRepo('owner/repo; rm -rf /'));
  assert.throws(() => normalizeGitHubRepo('../etc/passwd'));
});

test('validateBranchName rejects unsafe git ref strings', () => {
  assert.equal(validateBranchName('main'), 'main');
  assert.equal(validateBranchName('release/v1.2'), 'release/v1.2');
  assert.throws(() => validateBranchName('--upload-pack=evil'));
  assert.throws(() => validateBranchName('main;id'));
});

test('compareSemver accurately orders semantic versions', () => {
  assert.equal(compareSemver('1.0.1', '1.0.0'), 1);
  assert.equal(compareSemver('v2.0.0', '1.9.9'), 1);
  assert.equal(compareSemver('v1.2.0', '1.2.0'), 0);
  assert.equal(compareSemver('1.0.0', '1.1.0'), -1);
});
