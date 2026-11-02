const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = {};
function load(file) {
  if (cache[file]) return cache[file].exports;
  const filename = path.join(root, file);
  const { outputText: output } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const module = { exports: {} }; cache[file] = module;
  const localRequire = (spec) => spec.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), spec.endsWith('.ts') ? spec : `${spec}.ts`))) : require(spec);
  vm.runInNewContext(output, { module, exports: module.exports, require: localRequire }, { filename });
  return module.exports;
}
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const { sanitizeStoreLogoSvg } = load('features/keystone/utils/storeLogo.ts');
const { normalizeStoreLogoColor } = load('features/platform/property/lib/store-logo.ts');
const { HUE_PRESETS, LOGO_ICONS } = load('features/platform/property/lib/icon-registry.ts');
const custom = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="#16a34a"/></svg>';

test('the old sanitizer path is the E-commerce sanitizer', () => {
  assert.match(read('features/platform/property/lib/sanitize-store-logo.ts'), /from '\.\.\/\.\.\/\.\.\/keystone\/utils\/storeLogo'/);
  assert.equal(sanitizeStoreLogoSvg(custom), custom);
  assert.equal(sanitizeStoreLogoSvg('<svg onload="alert(1)"></svg>'), '');
});

test('every library logo survives the sanitizer; presets are E-commerce\'s', () => {
  assert.equal(LOGO_ICONS.length, 42);
  for (const icon of LOGO_ICONS) assert.equal(sanitizeStoreLogoSvg(icon.lightSvg), icon.lightSvg, icon.id);
  assert.equal(JSON.stringify(HUE_PRESETS.map((preset) => preset.value)), JSON.stringify([0, 30, 60, 120, 180, 270, 330]));
});

test('the hue is normalized to 0-359', () => {
  assert.equal(normalizeStoreLogoColor('390'), '30');
  assert.equal(normalizeStoreLogoColor('-30'), '330');
});

test('the page renders the E-commerce block; the action sanitizes, mutates and revalidates', () => {
  const page = read('features/platform/property/screens/PropertySettingsPage.tsx');
  assert.match(page, /\{\/\* Logo Icon Selector \*\/\}/);
  assert.match(page, /\{\/\* Logo Color Selector \*\/\}/);
  assert.match(page, /Edit SVG Code/);
  assert.doesNotMatch(page, /LogoPicker|LogoHueControl/);
  const action = read('features/platform/property/actions.ts');
  assert.match(action, /const logoIcon = submitted \? sanitizeStoreLogoSvg\(submitted\) : ''/);
  assert.match(action, /updateHotelPropertySettings\(data:\$data/);
  assert.match(action, /revalidatePath\('\/', 'layout'\)/);
  const mutation = read('features/keystone/mutations/updateHotelPropertySettings.ts');
  assert.match(mutation, /branding\.logoColor = normalizeStoreLogoColor\(data\.logoColor\)/);
});
