# Development Guide

## Setup

1. Install dependencies:

```bash
bun install
```

2. Set up pre-commit hooks:

```bash
bun prepare
```

## Development Workflow

### Code Formatting and Linting

The project uses ESLint and Prettier for code formatting and linting.

- **Automatic formatting**: Code is automatically formatted on save in VS Code if you have the Prettier extension installed.
- **Pre-commit hooks**: Code is automatically linted and formatted before commits.

To manually check and fix formatting:

```bash
# Check only
bun run lint

# Fix issues
bun run lint:fix
```

### Type Checking

Run TypeScript type checking without emitting files:

```bash
bun run typecheck
```

### Testing

Run unit tests:

```bash
bun run test
```

### Building

Build the project:

```bash
bun run build
```

## VS Code Setup

For the best development experience in VS Code, install the following extensions:

1. **ESLint** - `dbaeumer.vscode-eslint`
2. **Prettier** - `esbenp.prettier-vscode`
3. **TypeScript and JavaScript Language Features** (usually built-in)

The project includes VS Code settings in `.vscode/settings.json` that will enable:

- Format on save
- Fix ESLint issues on save
- Proper TypeScript import organization

## Troubleshooting

### Linting Issues

If you encounter linting issues that aren't automatically fixed, you can run:

```bash
bun run eslint:fix
```

### Pre-commit Hook Not Working

If the pre-commit hook isn't working, make sure the `.husky/pre-commit` file is executable:

```bash
chmod +x .husky/pre-commit
```

### Type Errors

Type errors can be identified with:

```bash
bun run typecheck
```
