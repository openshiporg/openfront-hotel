import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith('.tsx')) out.push(path);
  }
  return out;
}

test('status labels render as a coloured dot plus plain text, not a badge', () => {
  const source = readFileSync('features/platform/components/StatusPill.tsx', 'utf8');
  assert.doesNotMatch(source, /BadgeVariants|components\/ui\/badge/);
  assert.match(source, /TONE_DOT\[resolvedTone\]/);
});

test('staff screens do not use Badge components or pill colour sets', () => {
  const offenders = walk('features/platform').filter((file) => {
    const text = readFileSync(file, 'utf8');
    return /components\/ui\/badge|<Badge\b|TONE_PILL\[/.test(text);
  });
  assert.deepEqual(offenders, []);
});
