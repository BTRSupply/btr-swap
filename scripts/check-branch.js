#!/usr/bin/env node
import { execSync } from 'child_process';

const expected = process.argv[2] || 'main';
const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();

branch !== expected && (
  console.error(`Error: Only run from ${expected} branch`),
  process.exit(1)
);
