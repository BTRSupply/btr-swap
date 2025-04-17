#!/usr/bin/env bun
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const PKG = "./package.json";
const LOG = resolve("./CHANGELOG.md");
const DEPS = [resolve("./packages/core/package.json"), resolve("./packages/cli/package.json")];

// Removes local git tags that don't exist on the remote origin,
// except for the tag matching the current package.json version.
const cleanupDanglingTags = () => {
  try {
    const { version } = JSON.parse(readFileSync(PKG, "utf8"));
    // Fetch local and remote tags matching the vX.Y.Z pattern.
    const [localTags, remoteTags] = ['git tag -l "v*"', "git ls-remote --tags origin"].map(
      (cmd) =>
        execSync(cmd)
          .toString()
          .match(/v\d+\.\d+\.\d+/g) || [],
    );

    const localOnly = localTags.filter((t) => !remoteTags.includes(t));
    if (!localOnly.length) return console.log("No dangling tags found.");

    console.log(`Found ${localOnly.length} local-only tags: ${localOnly.join(", ")}`);
    localOnly.forEach((tag) => {
      // Only delete tags that don't match the current version.
      if (tag.slice(1) !== version) {
        execSync(`git tag -d ${tag}`);
        console.log(`Removed ${tag} (current: v${version})`);
      }
    });
  } catch (e) {
    console.warn("Warning: Tag cleanup error:", e.message);
  }
};

cleanupDanglingTags();

// Calculate new version based on bump type (major, minor, patch) or explicit version.
const bumpType = process.argv[2];
if (!bumpType) {
  console.error("Error: Provide bump type (major|minor|patch) or version");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(PKG, "utf8"));
let newVer = bumpType;

// If bumpType is not an explicit version string, calculate it based on the current version.
if (!/\d+\.\d+\.\d+/.test(bumpType)) {
  let [maj, min, pat] = pkg.version.split(".").map(Number);
  if (bumpType === "major") [maj, min, pat] = [++maj, 0, 0];
  else if (bumpType === "minor") [min, pat] = [++min, 0];
  else if (bumpType === "patch") pat++;
  else process.exit(1); // Exit if bump type is invalid.
  newVer = `${maj}.${min}.${pat}`;
}

// Exit if the calculated version is the same as the current version.
if (newVer === pkg.version) {
  console.log(newVer);
  process.exit(0);
}

// Update version in root package.json and core/cli package.json files.
// Also updates the core package dependency version in the cli package.
[PKG, ...DEPS].forEach((path) => {
  if (!existsSync(path)) return;
  const data = JSON.parse(readFileSync(path, "utf8"));
  data.version = newVer;
  data.dependencies?.["@btr-supply/swap"] && (data.dependencies["@btr-supply/swap"] = newVer);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
});

// Update CHANGELOG.md with changes since the last tag.
const DEFAULT_HEADER = `# BTR Swap Changelog\n\nAll changes documented here, based on [Keep a Changelog](https://keepachangelog.com).\nSee [CONTRIBUTING.md](./CONTRIBUTING.md) for details.\n\nNB: [Auto-generated from commits](./scripts/release.js) - DO NOT EDIT.\n\n`;
let log = existsSync(LOG) ? readFileSync(LOG, "utf8") : DEFAULT_HEADER;
log = log.includes("# BTR Swap Changelog") ? log : DEFAULT_HEADER; // Ensure header exists.

// Remove any existing entries for the new version to avoid duplicates.
while (log.includes(`## [${newVer}]`)) {
  const startPos = log.indexOf(`## [${newVer}]`);
  let endPos = log.indexOf("## [", startPos + 1);
  if (endPos === -1) endPos = log.length; // If no later version found, remove till end.
  log = log.substring(0, startPos) + log.substring(endPos);
}

// Categorize commits based on prefixes defined in typeMap.
const typeMap = {
  "[feat]": "Features",
  "[fix]": "Fixes",
  "[refac]": "Refactors",
  "[ops]": "Ops",
  "[docs]": "Docs",
};

const categorized = Object.fromEntries(Object.values(typeMap).map((c) => [c, []]));
try {
  // Get commits since the last tag, or from the beginning if no tags exist.
  const lastTag = execSync(
    "git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD",
  )
    .toString()
    .trim();
  execSync(`git log ${lastTag}..HEAD --pretty=format:"%s"`)
    .toString()
    .split("\n")
    .filter((c) => c && !c.startsWith("Merge ")) // Filter out empty lines and merge commits.
    .forEach((commit) => {
      // Use exact, case-insensitive matching for commit prefixes.
      const prefix = Object.keys(typeMap).find((p) =>
        commit.toLowerCase().startsWith(p.toLowerCase()),
      );

      if (prefix) {
        // Remove prefix, trim, and capitalize the commit message.
        const msg = commit.replace(new RegExp(`^${prefix}`, "i"), "").trim();
        categorized[typeMap[prefix]].push(msg[0].toUpperCase() + msg.slice(1));
      }
    });
} catch (e) {
  console.warn("Warning: Commit fetch error:", e.message);
}

// Generate the changelog entry for the new version.
Object.values(categorized).forEach((c) => c.sort()); // Sort messages within each category.
const entry = `## [${newVer}] - ${new Date().toISOString().slice(0, 10)}\n\n${Object.entries(
  categorized,
)
  .filter(([, c]) => c.length) // Only include categories with commits.
  .map(([k, v]) => `### ${k}\n${v.map((m) => `- ${m}`).join("\n")}`)
  .join("\n\n")}\n\n`;

// Insert the new entry at the beginning of the changelog content.
writeFileSync(
  LOG,
  log.includes("## [")
    ? log.replace("## [", `${entry}## [`) // Insert before the first existing version header.
    : log + entry, // Append if no versions exist yet.
);

// Attempt to run build and cleanup scripts after versioning.
try {
  execSync("bun run build", { stdio: "inherit" });
  execSync("bun scripts/cleanup.js", { stdio: "inherit" });
} catch (e) {
  console.warn(`Build error: ${e.message}`);
}

// Output the new version number.
console.log(newVer);
