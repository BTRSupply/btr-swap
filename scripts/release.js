#!/usr/bin/env bun
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PKG = './package.json';
const LOG = resolve('./CHANGELOG.md');
const DEPS = [resolve('./packages/core/package.json'), resolve('./packages/cli/package.json')];

const bumpType = process.argv[2];
if (!bumpType) {
  console.error('Error: Provide bump type (major|minor|patch) or specific version');
  process.exit(1);
}

// Parse and update version
const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
let newVer = bumpType;

if (!/^\d+\.\d+\.\d+$/.test(bumpType)) {
  let [maj, min, pat] = pkg.version.split('.').map(Number);
  if (bumpType === 'major') [maj, min, pat] = [++maj, 0, 0];
  else if (bumpType === 'minor') [min, pat] = [++min, 0];
  else if (bumpType === 'patch') pat++;
  else process.exit(1);
  newVer = `${maj}.${min}.${pat}`;
}

if (newVer === pkg.version) {
  console.log(newVer);
  process.exit(0);
}

// Update packages
pkg.version = newVer;
writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n');

DEPS.forEach(path => {
  if (!existsSync(path)) return;
  const data = JSON.parse(readFileSync(path, 'utf8'));
  data.version = newVer;
  if (data.dependencies?.['@btr-supply/swap']) data.dependencies['@btr-supply/swap'] = newVer;
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
});

// Update changelog
let log = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '# Changelog\n\n';
if (log.includes(`## [${newVer}]`)) process.exit(1);

const entry = `## [${newVer}] - ${new Date().toISOString().slice(0, 10)}\n\n### Added\n- \n\n### Changed\n- \n\n### Fixed\n- \n\n`;
writeFileSync(LOG, log.replace('# Changelog\n\n', `# Changelog\n\n${entry}`));

console.log(newVer);
