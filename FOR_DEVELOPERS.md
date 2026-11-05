# BezotCorp AI — For Developers

This document is the entry point for developers working on the BezotCorp AI codebase.

## Getting Started

Development requires:

- Visual Studio Code
- Node.js
- pnpm

Install the dependencies with:

    pnpm install

Compile the extension with:

    pnpm compile

Open the repository in Visual Studio Code and launch the included Extension Development Host configuration to run the development version of the extension.

## Repository Overview

BezotCorp AI is a TypeScript VS Code extension.

The main runtime code is located under `src/`.

Important areas include:

- `src/chat/` — conversations and sessions
- `src/i18n/` — localization
- `src/permissions/` — permissions and resource access
- `src/tools/` — built-in AI tools
- `src/webview/` — extension user interface

## Architecture

To understand the current technical architecture:

[Read the architecture documentation →](docs/architecture.md)

## Current Development Work

To see remaining implementation and validation work:

[View the current TODO →](docs/todo.md)

## Contributing

To contribute changes to BezotCorp AI:

[Read the contribution guidelines →](CONTRIBUTING.md)

## Product Documentation

For installation, configuration and usage of the extension:

[Read the README →](README.md)
