# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.25.0] - 2025-04-14

### Added

- Consolidated initial development (including pre-fork code from [Astrolab Swapper](https://github.com/AstrolabDAO/swapper)) and CI/CD setup into a single historical commit.
- This commit squashes the project's history up to version 1.25.0.

### Key changes include:

**Core Aggregator Logic (Pre-fork & Initial):**

- Implemented core swapping and bridging logic integrating with Lifi and Squid.
- Developed common interfaces (IToken, IEstimate, IStatusResponse).
- Remove on-chain Swapper contract (`Swapper.sol`) since out of scope for this package.
- Introduced initial unit and integration tests.

**Project Setup & Fork:**

- Forked from original [Astrolab Swapper](https://github.com/AstrolabDAO/swapper).
- Initialized monorepo structure (`btr-swap`) using Bun workspaces.
- Established core (@btr-supply/swap) and CLI (@btr-supply/swap-cli) packages.
- Configured TypeScript, Prettier, OXLint, and Husky for code quality.

**CI/CD Workflow (.github/workflows/release.yml):**

- Implemented automated version bumping, changelog generation, and GitHub Release creation (with attached tarballs).
- Created a robust build process for both packages using Bun.
- Set up automated publishing to npmjs.org and GitHub Packages using matrix strategy.
- Resolved numerous authentication and scope issues related to npm/GitHub Packages, including:
  - Handling case sensitivity differences between GitHub org (`BTRSupply` -> `btr-supply`) and package scope (`@btr-supply`).
  - Correctly configuring `.npmrc` via `setup-node` and manual steps.
  - Managing `NODE_AUTH_TOKEN` for different registries.
- Configured artifact upload/download for efficient job communication.
- Refactored release scripts (CommonJS to ESM).

**Versioning & Cleanup:**

- Consolidated complex commit history (including many version bumps) into one for clarity.
- Aligned package versions across the monorepo.
- Set final version to 1.25.0 to reflect this consolidation.
