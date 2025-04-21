# BTR Swap Changelog

All changes documented here, based on [Keep a Changelog](https://keepachangelog.com).
See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

NB: [Auto-generated from commits](./scripts/release.js) - DO NOT EDIT.

## [1.41.0] - 2025-04-21

### Fixes

- [fix] Correct package dependencies and test import paths
- [fix] Export AggId from core package
- [fix] Improve env file loading to properly handle custom paths
- [fix] Remove reference to non-existent IBaseSwapParams type
- [fix] Update CLI integration test path and assertions

### Refactors

- [refac] Make parser.test.ts more concise while preserving test logic
- [refac] Restore readonly modifiers on BaseAggregator properties
- [refac] Update CLI to use new env loading logic and improve logging

### Ops

- [ops] Update dependencies and apply formatting
- [ops] Update tsconfig paths for core and cli packages

## [1.40.0] - 2025-04-20

### Features

- [feat] Export toJSON utility function from core package

### Fixes

- [fix] Adjust CLI integration and unit tests for robustness and clarity
- [fix] Allow refac commit type prefix in validation script
- [fix] Correct regex patterns in check-name script
- [fix] Ensure CLI logs respect verbosity levels correctly

### Refactors

- [refac] Align IBtrSwapCliParams type with verbose flag usage
- [refac] Improve CLI argument parsing logic
- [refac] Update root package metadata and script names

### Ops

- [ops] Bump version to 1.39.0 and update dependencies
- [ops] Simplify Husky hooks

### Docs

- [docs] Add comments to release and helper scripts
- [docs] Update CHANGELOG for v1.39.0

## [1.39.0] - 2025-04-20

### Fixes

- [fix] Correct regex patterns in check-name script

### Refactors

- [refac] Improve CLI argument parsing logic
- [refac] Update root package metadata and script names

### Ops

- [ops] Simplify Husky hooks

### Docs

- [docs] Add comments to release and helper scripts

## [1.38.0] - 2025-04-17

### Features

- [feat] Add approveTo and refactor cost/tx handling in aggregators

### Ops

- [ops] Add top-level publish script

## [1.37.0] - 2025-04-17

### Fixes

- [fix] Correctly resolve package.json path in CLI for runtime

## [1.36.0] - 2025-04-17

### Ops

- [ops] Refactor and fix package packing step in release workflow

## [1.35.0] - 2025-04-17

### Fixes

- [fix] Ensure README is included in npm package and cleaned up

## [1.34.0] - 2025-04-16

### Ops

- [ops] Remove redundant artifact uploads from release workflow

## [1.33.0] - 2025-04-16

### Fixes

- [fix] Fix tarball naming pattern in release workflow
- [fix] Improve README handling in release workflow

### Refactors

- [refac] Simplify publish step in release workflow

## [1.32.0] - 2025-04-16

### Ops

- [ops] Fix YAML formatting in release workflow

## [1.31.0] - 2025-04-16

### Ops

- [ops] Add README cleanup steps to publishing workflow
- [ops] Fix NPM publishing workflow to include README

## [1.30.0] - 2025-04-16

### Fixes

- [fix] Changelog duplicates

### Ops

- [ops] Extract cleanup functionality to dedicated script
- [ops] Fix package build process: Use main README in core package, remove sourcemaps
- [ops] Remove conditional README retention logic
- [ops] Simplify build and cleanup process

## [1.29.0] - 2025-04-16

### Features

- [feat] Add btr-swap command alias and update CLI help text
- [feat] Add version flag and ASCII art header to CLI

### Refactors

- [refac] Remove unused command name detection function

### Ops

- [ops] Add explicit \*.tgz entries to gitignore
- [ops] Remove tsbuildinfo files from git tracking

## [1.28.0] - 2025-04-16

### Fixes

- [fix] Add @types/node dependency
- [fix] Correct buildCliCommand to only add --silent flag when specified
- [fix] Fix types in types.ts to match implementation

### Refactors

- [refac] Optimize CLI tests for conciseness and readability
- [refac] Optimize CLI tests with graceful error handling
- [refac] Optimize code and improve test output formatting
- [refac] Refine CLI test skipping logic

### Ops

- [ops] Exclude all tsbuildinfo files in gitignore

## [1.27.0] - 2025-04-15

### Fixes

- [fix] Added 'git add -u' after 'lint:fix' in 'pre-commit' to stage fixed already-tracked files
- [fix] Added dev/main to 'post-checkout' hook exclusion (glitchy name check)
- [fix] Added git add on pre-commit post-fix
- [fix] Updated/fixed 'release.js' release script to remove dangling github tags from failed publishing, and changelog generation fix
- [fix] Updated/fixed 'release.js' release script to replace changelog entry in case of a publish failure

### Ops

- [ops] Add branch validation script for release commands
- [ops] Enhance git hooks and release automation
- [ops] Updated changelog

## [1.26.0] - 2025-04-14

### Features

- [feat] Rango meta-aggregator implementation
- [feat] Unizen meta-aggregator implementation
- [feat] Odos aggregator implementation
- [feat] Intent/permit2-centric JITAggregator placeholder class added
- [feat] Added common interfaces (IToken, IEstimate, IStatusResponse)

### Fixes

- [fix] Resolve npm/GitHub package scope and authentication issues
- [fix] Align package versions across the monorepo

### Refactors

- [refac] Squid now extends BaseAggregator
- [refac] LiFi now extends BaseAggregator
- [refac] Socket now extends BaseAggregator
- [refac] 1Inch now extends BaseAggregator
- [refac] KyberSwap now extends BaseAggregator
- [refac] ParaSwap now extends BaseAggregator
- [refac] 0x now extends BaseAggregator
- [refac] Remove on-chain Astrolab Swapper contract as out of scope
- [refac] Consolidate complex commit history into a single historical commit
- [refac] Refactor release scripts from CommonJS to ESM

### Ops

- [ops] Configure TypeScript, Prettier, OXLint, and Husky for code quality
- [ops] Implement automated version bumping and changelog generation
- [ops] Create robust build process for both packages
- [ops] Set up automated publishing to npmjs.org and GitHub Packages
- [ops] Configure artifact upload/download for efficient job communication
- [ops] Set up core (@btr-supply/swap) and CLI (@btr-supply/swap-cli) packages
- [ops] Initialize monorepo structure with Bun workspaces

### Docs

- [docs] Document project setup and fork from Astrolab Swapper, update ./README.md

> **Note:** This release consolidates the initial development (including pre-fork code) and CI/CD setup from the original [Astrolab Swapper](https://github.com/AstrolabDAO/swapper) project.
