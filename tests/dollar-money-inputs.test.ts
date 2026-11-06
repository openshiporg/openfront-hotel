import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dollarsToMinor, minorToDollars } from '../features/platform/lib/format';
import { moneyText } from '../features/keystone/lib/moneyText';

test('dollar options: zero and signed amounts convert exactly to cents', () => {
  assert.equal(dollarsToMinor('0', { allowZero: true }), 0);
  assert.equal(dollarsToMinor('0.00', { allowZero: true }), 0);
  assert.equal(dollarsToMinor('0'), null);
  assert.equal(dollarsToMinor('-10.5', { signed: true }), -1050);
  assert.equal(dollarsToMinor('−0.29', { signed: true }), -29);
  assert.equal(dollarsToMinor('-$1,250.40', { signed: true }), -125040);
  assert.equal(dollarsToMinor('-5'), null);
  assert.equal(dollarsToMinor('.5'), 50);
  assert.equal(dollarsToMinor('12.'), 1200);
  for (const bad of ['.', '-', '$', '1.234', '1e3', '12,5.0.0', '--1']) assert.equal(dollarsToMinor(bad, { signed: true, allowZero: true }), null, bad);
});

test('cents round-trip back into a dollar field', () => {
  assert.equal(minorToDollars(1200), '12');
  assert.equal(minorToDollars(1250), '12.50');
  assert.equal(minorToDollars(5), '0.05');
  assert.equal(minorToDollars(-1050), '-10.50');
  assert.equal(minorToDollars(null), '');
  for (const cents of [0, 1, 29, 1999, 123456, -77]) assert.equal(dollarsToMinor(minorToDollars(cents) || '0', { signed: true, allowZero: true }), cents);
});

test('server errors staff can see read as dollars', () => {
  assert.equal(moneyText(1200), '$12.00');
  assert.equal(moneyText(123456), '$1,234.56');
});

test('staff money fields are dollars, never minor units or cents', () => {
  for (const file of [
    'features/platform/payments/screens/PaymentsPage.tsx',
    'features/platform/cashier/components/SecurityAuthorizationOperations.tsx',
    'features/platform/guest-governance/HotelApprovalsPage.tsx',
    'features/platform/payouts/screens/PayoutsPage.tsx',
    'features/platform/rate-plans/DerivedRatePanel.tsx',
    'features/platform/property/screens/PropertySettingsPage.tsx',
    'features/platform/receivables/screens/ReceivablesPage.tsx',
    'features/platform/maintenance/MaintenanceCommercialPanel.tsx',
  ]) {
    const page = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(page, /minor units|\(cents\)|\(minor\)|previewMinor/i, file);
    assert.match(page, /MoneyInput/, file);
  }
});

test('folio ledger rows show the posting type once, without a pill', () => {
  const page = readFileSync(new URL('../features/platform/folios/screens/FoliosPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /<Tag>\{humanize\(entry\.entryType\)\}<\/Tag>/);
  assert.doesNotMatch(page, /humanize\(entry\.sourceType\)/);
  assert.match(page, /entryMeta\(entry\)\.join/);
});

test('folio receipt CSV lists charges and credits in dollars', async () => {
  const { folioReceiptCsv } = await import('../features/platform/cashier/receiptCsv');
  const csv = folioReceiptCsv({ folioNumber: 'F-1', entries: [
    { serviceDate: '2026-11-06', entryType: 'room', description: 'Room', direction: 'debit', amountMinor: 18950, currencyCode: 'USD', sourceType: 'night_audit', sourceId: 'x' },
    { serviceDate: '2026-11-06', entryType: 'payment', description: 'Card', direction: 'credit', amountMinor: 5, currencyCode: 'USD', sourceType: 'payment', sourceId: 'y' },
  ] });
  assert.doesNotMatch(csv, /minor/i);
  assert.match(csv, /"189\.50",""/);
  assert.match(csv, /"","0\.05"/);
});

test('approval-required message names the amount in dollars, not cents', () => {
  const source = readFileSync('features/keystone/guest-governance/commands.ts', 'utf8');
  assert.match(source, /for \$\{moneyText\(input\.amountMinor\)\}/);
  assert.doesNotMatch(source, /amount \$\{input\.amountMinor\}/);
});
