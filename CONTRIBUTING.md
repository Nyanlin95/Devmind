# Contributing to DevMind

Thank you for your interest in improving DevMind! We welcome contributions to make developer context smarter and more accessible.

## Project Structure

DevMind is a single package with a unified codebase in `src/`:

- **src/cli.ts**: The main entry point for the CLI.
- **src/core/**: Shared utilities (logging, config, file I/O).
- **src/database/**: Database schema extraction and analysis.
- **src/codebase/**: Source code parsing and documentation generation.
- **src/commands/**: CLI command implementations.
- **src/generators/**: Documentation generators.

## Prerequisites

- Node.js >= 18
- pnpm >= 8 (or npm/yarn)

## Getting Started

1. **Clone the repository:**

   ```bash
   git clone https://github.com/Nyanlin95/devmind.git
   cd devmind
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

   _or_

   ```bash
   npm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```
   This compiles TypeScript to the `dist/` directory.

## Development Workflow

We use a standard TypeScript development workflow.

### Running in Dev Mode

To run the CLI directly from source:

```bash
npm run dev -- <command> [options]
# Example:
npm run dev -- generate
```

### Running Tests

Run all tests:

```bash
npm test
```

### Linking Locally

To test the CLI globally while developing:

```bash
npm link
# Now 'devmind' command points to your local build
```

## Pull Request Process

1. Create a feature branch (`git checkout -b feature/amazing-feature`).
2. Commit your changes (we follow [Conventional Commits](https://www.conventionalcommits.org/)).
3. Ensure tests pass (`npm test`).
4. Open a Pull Request.

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
