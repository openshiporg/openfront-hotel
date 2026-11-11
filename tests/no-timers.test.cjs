// Owner rule: no timer loops or instrumentation workers; time-based state advances on requests and staff buttons.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

test('no instrumentation.ts and no setInterval in server code', () => {
  assert.equal(fs.existsSync('instrumentation.ts'), false);
  const offenders = ['features', 'app', 'lib'].filter(d => fs.existsSync(d)).flatMap(d => walk(d))
    .filter(file => /\bsetInterval\s*\(/.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);
});
