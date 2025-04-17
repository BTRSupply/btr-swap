#!/usr/bin/env node
import { execSync } from "child_process";

// Get the expected branch name from the first argument, default to 'main'.
const expected = process.argv[2] || "main";
// Get the current branch name.
const branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();

// Exit with error if the current branch doesn't match the expected branch.
branch !== expected && (console.error(`Error: Only run from ${expected} branch`), process.exit(1));
