#!/usr/bin/env bun
import dts from "bun-plugin-dts";
import { join, resolve } from "node:path";
import { copyFile, rm } from "node:fs/promises";

const root = resolve(".");

// Configuration for building each package (core, cli).
const packages = {
  core: {
    src: (pkg) => `packages/${pkg}/src/index.ts`,
    dist: (pkg) => `packages/${pkg}/dist`,
    // Core package uses dts plugin for generating declaration files.
    buildOptions: { target: "bun", format: "esm", plugins: [dts({})] },
  },
  cli: {
    src: () => "packages/cli/src/cli.ts",
    dist: (pkg) => `packages/${pkg}/dist`,
    // CLI package targets node, marks core package as external to avoid bundling it.
    buildOptions: { target: "node", format: "esm", external: ["@btr-supply/swap"] },
  },
};

// Function to build a specific package.
const build = async (pkg) => {
  console.log(`Building ${pkg}...`);
  const { src, dist, buildOptions } = packages[pkg];
  // Clean the distribution directory before building.
  await rm(join(root, dist(pkg)), { recursive: true, force: true });

  const result = await Bun.build({
    entrypoints: [join(root, src(pkg))],
    outdir: join(root, dist(pkg)),
    sourcemap: "none",
    ...buildOptions,
  });

  if (!result.success) {
    console.error(`Build failed for ${pkg}:`, ...result.logs);
    process.exit(1);
  }
};

// Path to copy the root README to for the core package.
const readmeCopyTo = join(root, "packages/core/README.md");

// Main build process.
try {
  // Build core first.
  await build("core");
  // Copy root README into core package before building CLI (CLI doesn't need it).
  await copyFile(join(root, "README.md"), readmeCopyTo);
  // Build CLI.
  await build("cli");
  console.log("Build complete");
} catch (e) {
  console.error("Build error:", e);
  process.exit(1);
}
