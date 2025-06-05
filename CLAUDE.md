# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`get-rules` is an npm utility that downloads and installs `.mdc` rule files for AI-assisted coding tools (like Cursor) from the johnlindquist/get-rules repository. It's a self-contained Node.js CLI tool that fetches rule files via the GitHub API.

## Common Commands

### Development & Testing
```bash
# Install dependencies
pnpm install

# Run the CLI locally
node cli.js

# Run with custom repo
node cli.js org/repo

# Create npm release (automated via GitHub Actions)
npm run release
```

### Package Publishing
The project uses semantic-release for automated versioning and publishing:
- Commits to `main` branch trigger the release workflow
- Conventional commit messages determine version bumps
- NPM publishing is handled automatically via GitHub Actions

## Architecture & Key Components

### Main Components

1. **cli.js**: The core CLI script that:
   - Accepts optional `org/repo` arguments (defaults to `johnlindquist/get-rules`)
   - Fetches `.mdc` files from GitHub API
   - Downloads files to `.cursor/rules/` in the current working directory
   - Moves existing files to temp directory before downloading updates

### Rule System Architecture

The downloaded rules follow a specific structure documented in `RULES.md`:
- Rules are `.mdc` files (Markdown with Components) with YAML frontmatter
- Organized in category directories (cli/, docs/, git/, task/, etc.)
- Each rule has `alwaysApply` boolean to control automatic vs manual invocation
- Only `_global/_global.mdc` has `alwaysApply: true`

### Key Implementation Details

- Uses native Node.js `https` module (no external HTTP dependencies)
- Implements custom `httpsGetJson()` and `downloadFile()` helpers
- Preserves existing files by moving them to temp directory
- Creates `.cursor/rules` directory structure if it doesn't exist
- User-Agent header included for GitHub API compliance

## Release Process

This project uses semantic-release with the following configuration:
- Analyzes commits to determine version bumps
- Generates changelog in `CHANGELOG.md`
- Publishes to npm registry
- Creates GitHub releases
- Updates package.json and commits changes

To trigger a release, push conventional commits to the `main` branch:
- `feat:` for new features (minor version bump)
- `fix:` for bug fixes (patch version bump)
- `BREAKING CHANGE:` for breaking changes (major version bump)