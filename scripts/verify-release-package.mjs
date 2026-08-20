import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const packed = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: process.cwd(),
  encoding: 'utf8',
});
if (packed.status !== 0) {
  process.stderr.write(packed.stderr || packed.stdout);
  process.exit(packed.status || 1);
}

const manifests = JSON.parse(packed.stdout);
const files = new Set((manifests[0]?.files || []).map((entry) => entry.path));
const required = ['Dockerfile', 'package.json', 'npm-shrinkwrap.json'];
const missing = required.filter((file) => !files.has(file));
if (missing.length) {
  throw new Error(`Publishable artifact is missing required release files: ${missing.join(', ')}`);
}

const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
if (!/^COPY package\.json npm-shrinkwrap\.json \.\/$/m.test(dockerfile)) {
  throw new Error('Dockerfile must install from the lock-equivalent shipped in the npm artifact.');
}
if (/package-lock\.json/.test(dockerfile)) {
  throw new Error('Dockerfile cannot depend on package-lock.json because npm omits it from published artifacts.');
}
if (!/\bnpm ci\b/.test(dockerfile)) {
  throw new Error('Dockerfile must use npm ci for deterministic dependency installation.');
}

process.stdout.write(`${JSON.stringify({
  fileCount: files.size,
  required,
  dockerLock: 'npm-shrinkwrap.json',
}, null, 2)}\n`);
