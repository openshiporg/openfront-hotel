import assert from 'node:assert/strict';
import test from 'node:test';

import { railwayEdgeClientIp, requestNetworkIdentity } from './abuseControl';

function withEnv(value: string | undefined, run: () => void) {
  const previous = process.env.RAILWAY_ENVIRONMENT;
  if (value === undefined) delete process.env.RAILWAY_ENVIRONMENT;
  else process.env.RAILWAY_ENVIRONMENT = value;
  try { run(); } finally {
    if (previous === undefined) delete process.env.RAILWAY_ENVIRONMENT;
    else process.env.RAILWAY_ENVIRONMENT = previous;
  }
}

const ctx = (realIp: string | undefined, peer = '100.64.0.7', extra: Record<string, string> = {}) => ({
  req: { headers: { ...(realIp === undefined ? {} : { 'x-real-ip': realIp }), ...extra }, socket: { remoteAddress: peer } },
});

test('on Railway the edge X-Real-IP is the client, whatever edge peer carried it', () => {
  withEnv('production', () => {
    assert.equal(requestNetworkIdentity(ctx('198.51.100.4', '100.64.0.7')), '198.51.100.4');
    assert.equal(requestNetworkIdentity(ctx('198.51.100.4', '100.64.0.9')), '198.51.100.4');
    assert.equal(requestNetworkIdentity(ctx('198.51.100.4', '100.64.0.7', { 'x-forwarded-for': '203.0.113.1' })), '198.51.100.4');
  });
});

test('malformed X-Real-IP, loopback peers and non-Railway hosts fall back to the socket rules', () => {
  withEnv('production', () => {
    assert.equal(railwayEdgeClientIp(ctx('1.2.3.4, 5.6.7.8').req), null);
    assert.equal(railwayEdgeClientIp(ctx('not-an-ip').req), null);
    assert.equal(railwayEdgeClientIp(ctx('198.51.100.4', '127.0.0.1').req), null);
    assert.equal(requestNetworkIdentity(ctx(undefined, '100.64.0.7')), '100.64.0.7');
  });
  withEnv(undefined, () => {
    assert.equal(requestNetworkIdentity(ctx('198.51.100.4', '100.64.0.7')), '100.64.0.7');
  });
});
