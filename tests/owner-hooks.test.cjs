// Ownership and author hooks: a relationship hook may fill the session user only on create
// (or, for shopper self-service hooks, never when the editor is staff).
// Before this, an update by staff relinked carts and rewrote event authors to the editor. Offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const models = path.resolve(__dirname, '..', 'features/keystone/models');

function sessionConnectHooks() {
  const hits = [];
  for (const file of fs.readdirSync(models).filter((f) => f.endsWith('.ts'))) {
    const src = fs.readFileSync(path.join(models, file), 'utf8');
    for (const m of src.matchAll(/(\w+): relationship\(\{[\s\S]*?\n {4}\}\),/g)) {
      if (/connect: \{ id: context\.session/.test(m[0])) hits.push({ file, field: m[1], body: m[0] });
    }
  }
  return hits;
}

test('no relationship hook connects the session user on update', () => {
  for (const hit of sessionConnectHooks()) {
    // A hook that never applies to staff (shopper self-service, e.g. Address.user, which checkout
    // reads to find the customer) cannot relink a customer's record to a staff editor.
    if (/!permissions\.can\w+\(\{ session: context\.session \}\)/.test(hit.body)) continue;
    assert.doesNotMatch(hit.body, /operation === ['"]update['"]/, `${hit.file} ${hit.field} must only default on create`);
  }
});

