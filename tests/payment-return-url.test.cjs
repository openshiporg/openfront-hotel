const test = require('node:test');
const assert = require('node:assert/strict');
require('tsx/cjs');
const { paymentRequestOrigin, safePaymentReturnUrl } = require('../features/keystone/lib/paymentReturnUrl.ts');
const env = { NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://hotel.openship.org' };
const context = (origin, host = 'alder.openship.org', extra = {}) => ({ req: { headers: { origin, host, ...extra } } });

test('brand checkout returns to the same brand host while canonical origin stays configured', () => {
  assert.equal(safePaymentReturnUrl('https://alder.openship.org/stripe/return?bookingId=qa', context('https://alder.openship.org'), '/stripe/return', env), 'https://alder.openship.org/stripe/return?bookingId=qa');
  assert.equal(safePaymentReturnUrl('/book?bookingId=qa', context('https://alder.openship.org'), '/book', env), 'https://alder.openship.org/book?bookingId=qa');
});
test('canonical checkout and originless server requests retain canonical fallback', () => {
  assert.equal(paymentRequestOrigin(context('https://hotel.openship.org', 'hotel.openship.org'), env), env.NEXT_PUBLIC_SITE_URL);
  assert.equal(paymentRequestOrigin(context(''), env), env.NEXT_PUBLIC_SITE_URL);
});
test('cross-origin, forwarded-host spoof, HTTP, credentials, wrong paths and fragments fail closed', () => {
  for (const origin of ['https://evil.example', 'http://alder.openship.org', 'https://a:b@alder.openship.org', 'null']) {
    assert.throws(() => paymentRequestOrigin(context(origin, 'alder.openship.org', { 'x-forwarded-host': 'evil.example' }), env));
  }
  for (const url of ['https://evil.example/stripe/return', '//evil.example/stripe/return', '/dashboard', '/stripe/return#fragment', 'https://a:b@alder.openship.org/stripe/return']) {
    assert.throws(() => safePaymentReturnUrl(url, context('https://alder.openship.org'), '/stripe/return', env));
  }
});
test('Headers request representation and local development work', () => {
  assert.equal(paymentRequestOrigin({ req: { headers: new Headers({ origin: 'https://alder.openship.org', host: 'alder.openship.org' }) } }, env), 'https://alder.openship.org');
  assert.equal(paymentRequestOrigin(context('http://hotel.local', 'hotel.local'), { NODE_ENV: 'development' }), 'http://hotel.local');
});
