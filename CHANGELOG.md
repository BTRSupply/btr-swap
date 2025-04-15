# BTR Swap Changelog

All changes documented here, based on [Keep a Changelog](https://keepachangelog.com).
See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

NB: [Auto-generated from commits](./scripts/release.js) - DO NOT EDIT.

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
