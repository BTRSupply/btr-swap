# Contributing to BTR Swap

Thank you for your interest in contributing to BTR Swap! This document provides guidelines for contributing to the project. All participants are expected to be respectful and inclusive in all interactions. Harassment of any kind is not tolerated.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Branch Structure](#branch-structure)
- [Naming Conventions](#naming-conventions)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Release Process](#release-process)

## Getting Started

### Prerequisites

- **Unix system**: macOS, Linux, or [WSL (Windows Subsystem for Linux)](https://learn.microsoft.com/en-us/windows/wsl/install) are required for Husky hooks to work
- **[Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)**: version control
- **[Bun](https://bun.sh/docs/installation)**: drop-in node replacement and package manager

### Setup steps

1. **Fork the repository** to your GitHub account.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/btr-supply/btr-swap.git
   cd btr-swap
   ```
3. **Set up the environment**:
   ```bash
   bun install && bun run prepare
   ```

## Development Workflow

We follow a simplified version of the widely popular [gitflow](https://danielkummer.github.io/git-flow-cheatsheet/):

```
main     ← production-ready, automatic version bump + packaging + release on publish
└── dev  ← active development (features, fixes merged here)
    └── feat/fancy-stuff
    └── fix/bug-123
```

1. Create a new branch from `dev` with the appropriate prefix (see [Naming Conventions](#naming-conventions)).
2. Make your changes and ensure code quality by running `bun run pre-commit`.
3. Commit your changes with a properly formatted commit message.
4. Create a pull request to merge your changes into the `dev` branch.
5. After review and approval, your changes will be merged into `dev`.
6. Periodically, the `dev` branch is merged (linearly) into `main` for releases.

## Branch Structure

- **`main`** - Production branch

  - Contains stable, released code
  - Automatic version bump + packaging + release creation on `bun run publish:[type]`
  - The `push-tag` script creates a GitHub tag that triggers `.github/workflows/release.yml`

- **`dev`** - Development branch

  - Active development happens here
  - Features and fixes are merged into this branch
  - Periodic merges into `main` for releases

- **Feature/Fix branches** - Created from `dev`
  - Follow naming conventions
  - Always merge back into `dev`

## Naming Conventions

### Branch and Commit Format

All branches, commits, and issues must use specific prefixes for consistency:

| Type      | Description                   | Branch Example         | Commit/Issue Example                           |
| --------- | ----------------------------- | ---------------------- | ---------------------------------------------- |
| **feat**  | New features, improvements... | `feat/odos-aggregator` | `[feat] Add support for Odos aggregator`       |
| **fix**   | Bug fixes, typo...            | `fix/lifi-quote-error` | `[fix] Resolve issue with LIFI quotes failing` |
| **refac** | Code styling, performance...  | `refac/routing-logic`  | `[refac] Optimize token fetching logic`        |
| **ops**   | Tooling, scripting, CI/CD...  | `ops/github-actions`   | `[ops] Update build pipeline`                  |
| **docs**  | Documentation, README...      | `docs/api-examples`    | `[docs] Add examples for cross-chain swaps`    |

#### Important Notes:

- Commit messages and issue titles should be capitalized
- Branch names must start with the type prefix followed by `/`
- Commit messages and issue titles must start with the type in square brackets `[]`
- Our automatic checks verify these formats before allowing commits, pushes, and branch changes

## Pull Request Process

1. Ensure all tests pass and linting rules are satisfied.
2. The pull request title should follow the same format as commit messages.
3. Reference related issues in your PR description.
4. Wait for review from a project maintainer.

## Coding Standards

We enforce coding standards through automatic linting and formatting:

- **Linting**: We use `oxlint` for linting JavaScript/TypeScript code
  - Configuration is in `.oxlintrc.json`
  - Run `bun run lint` to check for issues
- **Formatting**: We use `prettier` for code formatting
  - Run `bun run format:fix` to format code
- **Type checking**: TypeScript type validation
  - Run `bun run typecheck` to verify type correctness
- **Pre-commit checks**: Run the full suite of checks
  - `bun run pre-commit` runs formatting, linting, type checking, and builds the project
  - This command is automatically executed by Husky before each commit

## Testing

All code changes should include appropriate tests:

- **Unit tests**: `bun run test:unit`

  - Fast, focused tests that don't require external services
  - Should be run frequently during development

- **Integration tests**: `bun run test:integration`
  - End-to-end tests that interact with external services
  - **Important**: These tests consume API calls to external aggregators
  - Run responsibly and sparingly to avoid hitting rate limits
  - Consider using the more targeted tests when possible:
    - `bun run test:simple` - Basic integration test
    - `bun run test:cli` - CLI-specific tests

## Release Process

This project follows [Semantic Versioning](https://semver.org/):

1. **Prepare**: Add changes to "Unreleased" in CHANGELOG.md
2. **Release** (for maintainers):
   - `bun run publish:patch` / `bun run publish:minor` / `bun run publish:major`
3. **Automation**: GitHub Actions creates a release with notes from CHANGELOG.md
