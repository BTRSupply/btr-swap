#!/usr/bin/env bun
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const PKG = './package.json';
const LOG = resolve('./CHANGELOG.md');
const DEPS = [resolve('./packages/core/package.json'), resolve('./packages/cli/package.json')];

// Get bump type or version
const bumpType = process.argv[2];
if (!bumpType) {
  console.error('Error: Provide bump type (major|minor|patch) or specific version');
  process.exit(1);
}

// Calculate new version
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

// Update package.json files
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
const DEFAULT_HEADER = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),\nand this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n\nFor details on commit message categories, see [CONTRIBUTING.md](./CONTRIBUTING.md).\n\n';
let log = existsSync(LOG) ? readFileSync(LOG, 'utf8') : DEFAULT_HEADER;
if (log.includes(`## [${newVer}]`)) process.exit(1);

// Get commits since last tag
const getCommits = () => {
  try {
    const lastTag = execSync('git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD').toString().trim();
    return execSync(`git log ${lastTag}..HEAD --pretty=format:"%s"`)
      .toString().split('\n').filter(c => c && !c.startsWith('Merge '));
  } catch {
    console.warn('Warning: Could not fetch commits.');
    return [];
  }
};

// Categorize and sort commits
const typeMap = {
  '[feat]': 'Features',
  '[fix]': 'Fixes',
  '[refac]': 'Refactors',
  '[ops]': 'Ops',
  '[docs]': 'Docs'
};

const categorized = Object.fromEntries(
  Object.values(typeMap).map(cat => [cat, []])
);

getCommits().forEach(commit => {
  for (const [prefix, category] of Object.entries(typeMap)) {
    if (commit.toLowerCase().startsWith(prefix.toLowerCase())) {
      // Remove prefix, capitalize first letter
      const message = commit.replace(new RegExp(`^${prefix}`, 'i'), '').trim();
      categorized[category].push(message.charAt(0).toUpperCase() + message.slice(1));
      break;
    }
  }
});

// Sort all categories
Object.values(categorized).forEach(commits => commits.sort());

// Generate entry with non-empty categories
let entry = `## [${newVer}] - ${new Date().toISOString().slice(0, 10)}\n\n`;
Object.entries(categorized).forEach(([category, commits]) => {
  if (commits.length === 0) return;
  entry += `### ${category}\n${commits.map(c => `- ${c}`).join('\n')}\n\n`;
});

// Ensure header exists and update log
if (!log.includes('# Changelog')) {
  log = DEFAULT_HEADER;
}

writeFileSync(LOG, log.replace(/# Changelog.*?\n\n/s, DEFAULT_HEADER + entry));
console.log(newVer);
