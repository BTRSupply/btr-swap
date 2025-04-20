#!/usr/bin/env node
import fs from "fs";
import { execSync as runCmd } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

// Helper to run shell commands synchronously
const run = (c) => {
  try {
    return runCmd(c, { stdio: "pipe" }).toString().trim();
  } catch {
    return "";
  }
};

const dir = dirname(fileURLToPath(import.meta.url));
const defaultMsg = resolve(dir, "..", `.git/COMMIT_EDITMSG`);
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
// Parse command line flags
const branchCheck = has("-b") || has("--check-branch");
const commitCheck = has("-c") || has("--check-commit");
const pushCheck = has("-p") || has("--check-push");
// Determine commit message file path, defaulting if checking commit
const idx = args.indexOf("--commit-msg-file");
const msgFile = (idx >= 0 && args[idx + 1]) || defaultMsg;
// Regex patterns for branch and commit message formats
const re = (t) =>
  t === "branch" ? /^(feat|fix|refactor|ops|docs)\// : /^\[(feat|fix|refactor|refac|ops|docs)\] /;
// Get current branch and check if it's protected
const branch = run("git rev-parse --abbrev-ref HEAD");
const protectedBranch = ["main", "dev", "HEAD"].includes(branch);
let valid = true;
// Records a failure message and sets the global invalid flag
const fail = (t, v) => {
  console.error(`[POLICY] Invalid ${t}: ${v}`);
  valid = false;
};

// 1. Check Branch Name (if checking branch or push, and not protected)
if ((branchCheck || pushCheck) && !protectedBranch && !re("branch").test(branch))
  fail("branch", branch);

// 2. Check Commit Message (if checking commit and file exists)
if (commitCheck && fs.existsSync(msgFile)) {
  const m = fs.readFileSync(msgFile, "utf8").trim();
  const commitRegex = re("commit");
  if (!commitRegex.test(m)) fail("commit", m);
}

// 3. Check Pre-push Commit Format (if checking push, and not protected)
if (pushCheck && !protectedBranch) {
  const base = run("git rev-parse --abbrev-ref --symbolic-full-name @{u}") || "HEAD~1";
  run(`git log ${base}..HEAD --pretty=%B`)
    .split("\n\n\n")
    .forEach((m, i) => {
      const t = m.trim();
      // Validate each non-empty commit message
      if (t && !re("commit").test(t)) fail(`commit${i}`, t.split("\n")[0]);
    });
}

// Exit with appropriate status code
process.exit(valid ? 0 : (console.error("Failed"), 1));
