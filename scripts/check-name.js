#!/usr/bin/env node
import { execSync as exec } from "child_process";
import fs from "fs";

// Regex pattern for allowed prefixes (feat, fix, refactor, ops, docs)
// followed by either '/' (for branches) or '[' (for commits/issues).
const pattern = (type) => `^(feat|fix|refactor|ops|docs)${type === "branch" ? "/" : "\\["}(.|\n)*`;

// Parse command line arguments.
const args = new Set(process.argv.slice(2));
const [checkBranch, checkCommit, checkPush] = [
  "-b",
  "--check-branch",
  "-c",
  "--check-commit",
  "-p",
  "--check-push",
].map((flag) => args.has(flag));

// Find the commit message file if provided (used by commit-msg hook).
const msgFile = process.argv[process.argv.indexOf("--commit-msg-file") + 1];

let isValid = true;
const fail = (type, val) => (
  console.error(`\n[POLICY] Invalid ${type}: ${val}\n`), (isValid = false)
);
const run = (cmd) => {
  try {
    return exec(cmd, { stdio: "pipe" }).toString().trim();
  } catch {
    return "";
  }
};

// Get current branch name.
const branch = run("git rev-parse --abbrev-ref HEAD");
// Define protected branches that bypass naming checks.
const isProtectedBranch = ["main", "dev", "HEAD"].includes(branch);

// === Checks ===

// Check branch name format (if checkBranch or checkPush is specified and not on a protected branch).
(checkBranch || checkPush) &&
  !isProtectedBranch &&
  !RegExp(pattern("branch")).test(branch) &&
  fail("branch", branch);

// Check commit message format (if checkCommit is specified and a message file is provided).
if (checkCommit && msgFile) {
  try {
    const msg = fs.readFileSync(msgFile, "utf-8").trim();
    !RegExp(pattern("commit")).test(msg) && fail("commit", msg);
  } catch (err) {
    fail("read", err.message);
  }
}

// Check format of commit messages being pushed (if checkPush is specified and not on a protected branch).
if (checkPush && !isProtectedBranch) {
  // Determine the range of commits to check: from upstream branch or default base.
  let range =
    run("git rev-parse --abbrev-ref --symbolic-full-name @{u}") ||
    (() => {
      // Fallback: Find main or master, use merge-base, or default to last commit.
      const mainBranch = run(
        "git show-ref --verify --quiet refs/heads/main && echo main || echo master",
      );
      return (mainBranch && run(`git merge-base HEAD ${mainBranch}`)) || "HEAD~1";
    })();
  range += "..HEAD";

  // Check each commit message in the range.
  run(`git log ${range} --pretty=%B`)
    .split("\n\n\n")
    .map((msg) => msg.trim())
    .filter(Boolean)
    .forEach(
      (msg, idx) =>
        !RegExp(pattern("commit")).test(msg) && fail(`commit${idx}`, msg.split("\n")[0]),
    );
}

// Exit with status code 0 if valid, 1 otherwise.
isValid ? console.log("OK") : (console.error("\nFailed\n"), process.exit(1));
