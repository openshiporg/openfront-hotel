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

test('folio credits read as "Credit owed" instead of a negative balance', () => {
  const source = readFileSync('features/platform/folios/screens/FoliosPage.tsx', 'utf8');
  assert.match(source, /label: 'Credit owed', value: formatMoney\(-openBalanceMinor/);
  assert.match(source, /'Credit owed' : 'Balance'/);
});

test('reservations header names the property time zone instead of UTC', () => {
  const page = readFileSync('features/platform/reservations/screens/ReservationsPage.tsx', 'utf8');
  assert.doesNotMatch(page, /UTC business dates/);
  assert.match(page, /timeZoneLabel\(timeZone\)/);
  assert.doesNotMatch(readFileSync('features/platform/reservations/components/ReservationCalendar.tsx', 'utf8'), /All dates are UTC/);
});
