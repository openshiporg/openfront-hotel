import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dollarsToMinor } from '../features/platform/lib/format';

test('folio amounts are typed in dollars and sent as integer cents', () => {
  assert.equal(dollarsToMinor('25'), 2500);
  assert.equal(dollarsToMinor('25.5'), 2550);
  assert.equal(dollarsToMinor('$1,234.56'), 123456);
  assert.equal(dollarsToMinor('0.29'), 29); // no float drift (0.29 * 100 = 28.999…)
  assert.equal(dollarsToMinor('19.99'), 1999);
  for (const bad of ['', '0', '0.00', '-5', '1.234', 'abc', '1e3']) assert.equal(dollarsToMinor(bad), null, bad);
});

test('settlement form shows a dollar field, not minor units', () => {
  const page = readFileSync(new URL('../features/platform/folios/screens/FoliosPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /minor units/i);
  assert.match(page, /inputMode="decimal"/);
});
