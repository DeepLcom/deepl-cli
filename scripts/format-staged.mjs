#!/usr/bin/env node
/**
 * Formats staged TypeScript files with Prettier and re-stages them, so
 * formatting is applied rather than asked of the author and `format:check`
 * cannot fail in CI for a commit made through this hook.
 *
 * Prettier is run twice. It preserves whether an object literal was written
 * multi-line, and that interacts with member-chain breaking: an over-long
 * single-line object at the end of a chain formats to "chain broken, object
 * expanded" on the first pass, then to "chain collapsed, object hugged" on the
 * second, which is the fixed point. One pass would leave content a later
 * `format:check` rejects.
 */

import { execFileSync } from 'node:child_process';

const PREFIXES = ['src/', 'tests/'];

function git(args) {
  return execFileSync('git', args, { encoding: 'utf-8' });
}

function paths(args) {
  return new Set(
    git(args)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  );
}

const staged = [...paths(['diff', '--cached', '--name-only', '--diff-filter=ACM'])]
  .filter((file) => file.endsWith('.ts'))
  .filter((file) => PREFIXES.some((prefix) => file.startsWith(prefix)));

// Rewriting a file that is only partially staged and then re-adding it would
// stage the hunks the author deliberately left out, so those are reported and
// left alone rather than quietly widened.
const unstaged = paths(['diff', '--name-only', '--diff-filter=ACM']);
const partial = staged.filter((file) => unstaged.has(file));
const safe = staged.filter((file) => !unstaged.has(file));

if (partial.length > 0) {
  console.warn(
    `prettier: skipping ${partial.length} partially staged file(s); run "npm run format" before committing:\n` +
      partial.map((file) => `  ${file}`).join('\n')
  );
}

if (safe.length === 0) {
  process.exit(0);
}

// Respects .prettierignore, so an ignored file — the generated language
// snapshot — is skipped rather than rewritten into permanent check:languages
// drift.
for (let pass = 0; pass < 2; pass++) {
  execFileSync('npx', ['prettier', '--write', '--ignore-unknown', ...safe], {
    stdio: 'inherit',
  });
}

git(['add', '--', ...safe]);
