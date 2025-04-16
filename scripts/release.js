#!/usr/bin/env bun
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const PKG = './package.json';
const LOG = resolve('./CHANGELOG.md');
const DEPS = [resolve('./packages/core/package.json'), resolve('./packages/cli/package.json')];

// Clean dangling tags and bump version
const cleanupDanglingTags = () => {
  try {
    const { version } = JSON.parse(readFileSync(PKG, 'utf8'));
    const [localTags, remoteTags] = ['git tag -l "v*"', 'git ls-remote --tags origin']
      .map(cmd => execSync(cmd).toString().match(/v\d+\.\d+\.\d+/g) || []);

    const localOnly = localTags.filter(t => !remoteTags.includes(t));
    if (!localOnly.length) return console.log('No dangling tags found.');

    console.log(`Found ${localOnly.length} local-only tags: ${localOnly.join(', ')}`);
    localOnly.forEach(tag => {
      if (tag.slice(1) !== version) {
        execSync(`git tag -d ${tag}`);
        console.log(`Removed ${tag} (current: v${version})`);
      }
    });
  } catch (e) { console.warn('Warning: Tag cleanup error:', e.message) }
};

cleanupDanglingTags();

// Calculate new version
const bumpType = process.argv[2];
if (!bumpType) {
  console.error('Error: Provide bump type (major|minor|patch) or version');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
let newVer = bumpType;

if (!/\d+\.\d+\.\d+/.test(bumpType)) {
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

// Update all package.json files
[PKG, ...DEPS].forEach(path => {
  if (!existsSync(path)) return;
  const data = JSON.parse(readFileSync(path, 'utf8'));
  data.version = newVer;
  data.dependencies?.['@btr-supply/swap'] && (data.dependencies['@btr-supply/swap'] = newVer);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
});

// Update changelog
const DEFAULT_HEADER = `# BTR Swap Changelog\n\nAll changes documented here, based on [Keep a Changelog](https://keepachangelog.com).\nSee [CONTRIBUTING.md](./CONTRIBUTING.md) for details.\n\nNB: [Auto-generated from commits](./scripts/release.js) - DO NOT EDIT.\n\n`;
let log = existsSync(LOG) ? readFileSync(LOG, 'utf8') : DEFAULT_HEADER;
log = log.includes('# BTR Swap Changelog') ? log : DEFAULT_HEADER;

// Remove all existing entries for this version if they exist
while (log.includes(`## [${newVer}]`)) {
  const startPos = log.indexOf(`## [${newVer}]`);
  let endPos = log.indexOf('## [', startPos + 1);
  if (endPos === -1) endPos = log.length;
  log = log.substring(0, startPos) + log.substring(endPos);
}

// Categorize commits since last tag
const typeMap = {
  '[feat]': 'Features',
  '[fix]': 'Fixes',
  '[refac]': 'Refactors',
  '[ops]': 'Ops',
  '[docs]': 'Docs'
};

const categorized = Object.fromEntries(Object.values(typeMap).map(c => [c, []]));
try {
  const lastTag = execSync('git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD').toString().trim();
  execSync(`git log ${lastTag}..HEAD --pretty=format:"%s"`)
    .toString().split('\n')
    .filter(c => c && !c.startsWith('Merge '))
    .forEach(commit => {
      // Use exact matching for commit prefixes to avoid partial matches
      const prefix = Object.keys(typeMap).find(p =>
        commit.toLowerCase().startsWith(p.toLowerCase())
      );

      if (prefix) {
        const msg = commit.replace(new RegExp(`^${prefix}`, 'i'), '').trim();
        categorized[typeMap[prefix]].push(msg[0].toUpperCase() + msg.slice(1));
      }
    });
} catch (e) { console.warn('Warning: Commit fetch error:', e.message) }

// Generate and insert changelog entry
Object.values(categorized).forEach(c => c.sort());
const entry = `## [${newVer}] - ${new Date().toISOString().slice(0, 10)}\n\n${Object.entries(categorized)
  .filter(([, c]) => c.length)
  .map(([k, v]) => `### ${k}\n${v.map(m => `- ${m}`).join('\n')}`)
  .join('\n\n')
  }\n\n`;

writeFileSync(LOG, log.includes('## [')
  ? log.replace('## [', `${entry}## [`)
  : log + entry
);

try {
  execSync('bun run build', { stdio: 'inherit' });
  execSync('bun scripts/cleanup.js', { stdio: 'inherit' });
} catch (e) {
  console.warn(`Build error: ${e.message}`);
}

console.log(newVer);
