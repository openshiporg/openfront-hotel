import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// Checks the artifact against the current release contract: Railway (Railpack) builds with
// `keystone build --no-ui && next build` and starts with `npm run migrate && next start`,
// installing from the shipped npm-shrinkwrap.json.
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
const required = ['package.json', 'npm-shrinkwrap.json', 'railway.toml', 'keystone.ts', 'schema.prisma'];
const missing = required.filter((file) => !files.has(file));
if (missing.length) {
  throw new Error(`Publishable artifact is missing required release files: ${missing.join(', ')}`);
}
if (![...files].some((file) => file.startsWith('migrations/') && file.endsWith('/migration.sql'))) {
  throw new Error('Publishable artifact must ship the Prisma migrations that `npm run migrate` applies.');
}

// Local evidence and secrets never ship.
const forbidden = [/^\.env(\.|$)(?!example$)/, /^\.runtime\//, /^\.diffui\//, /^\.hallmark\//, /^\.claude\//, /^\.pi\//, /^package-lock\.json$/];
const leaked = [...files].filter((file) => forbidden.some((pattern) => pattern.test(file)));
if (leaked.length) {
  throw new Error(`Publishable artifact includes local evidence or secret paths: ${leaked.length} file(s).`);
}

const railway = await readFile(new URL('../railway.toml', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
if (!/^builder\s*=\s*"RAILPACK"$/m.test(railway)) throw new Error('railway.toml must build with Railpack.');
if (!/^buildCommand\s*=\s*"keystone build --no-ui && next build"$/m.test(railway)) {
  throw new Error('railway.toml must build Keystone and Next.js with `keystone build --no-ui && next build`.');
}
if (!/^startCommand\s*=\s*"npm run migrate && next start"$/m.test(railway)) {
  throw new Error('railway.toml must apply migrations before `next start`.');
}
if (packageJson.scripts?.migrate !== 'prisma migrate deploy') {
  throw new Error('package.json `migrate` must run `prisma migrate deploy`.');
}

process.stdout.write(`${JSON.stringify({
  fileCount: files.size,
  required,
  lock: 'npm-shrinkwrap.json',
  builder: 'RAILPACK',
}, null, 2)}\n`);
