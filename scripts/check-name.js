#!/usr/bin/env node
import { execSync as exec } from 'child_process';
import fs from 'fs';

const pattern = type => `^(feat|fix|refactor|ops|docs)${type === 'branch' ? '/' : '\\['}(.|\n)*`;
const args = new Set(process.argv.slice(2));
const [checkBranch, checkCommit, checkPush] = ['-b', '--check-branch', '-c', '--check-commit', '-p', '--check-push'].map(flag => args.has(flag));
const msgFile = process.argv[process.argv.indexOf('--commit-msg-file') + 1];

let isValid = true;
const fail = (type, val) => (console.error(`\n[POLICY] Invalid ${type}: ${val}\n`), isValid = false);
const run = cmd => { try { return exec(cmd, { stdio: 'pipe' }).toString().trim(); } catch { return ''; } };

const branch = run('git rev-parse --abbrev-ref HEAD');
const isMain = ['main', 'HEAD'].includes(branch);

// Checks
(checkBranch || checkPush) && !isMain && !RegExp(pattern('branch')).test(branch) && fail('branch', branch);

if (checkCommit && msgFile) {
  try {
    const msg = fs.readFileSync(msgFile, 'utf-8').trim();
    !RegExp(pattern('commit')).test(msg) && fail('commit', msg);
  } catch (err) { fail('read', err.message); }
}

if (checkPush && !isMain) {
  let range = run('git rev-parse --abbrev-ref --symbolic-full-name @{u}') || (() => {
    const mainBranch = run('git show-ref --verify --quiet refs/heads/main && echo main || echo master');
    return (mainBranch && run(`git merge-base HEAD ${mainBranch}`)) || 'HEAD~1';
  })();
  range += '..HEAD';

  run(`git log ${range} --pretty=%B`).split('\n\n\n').map(msg => msg.trim()).filter(Boolean)
    .forEach((msg, idx) => !RegExp(pattern('commit')).test(msg) && fail(`commit${idx}`, msg.split('\n')[0]));
}

isValid ? console.log('OK') : (console.error('\nFailed\n'), process.exit(1));
