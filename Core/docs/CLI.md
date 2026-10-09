# RitaWapp CLI & Global Launcher Specification (v1.0.1)

## 1. Global Command: `rwa`

After running `rwa setup` (or `deno task setup`), developers can invoke `rwa`
from any folder or command shell.

- **Launcher Source**: `Core/cli/bin/rwa.cmd`
- **Installed Target**: `%LOCALAPPDATA%\RitaWapp\bin\rwa.cmd`
- **Root Pointer**: `%LOCALAPPDATA%\RitaWapp\bin\rwa.root`

## 2. CLI Command Table

| Command                   | Description                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `rwa init <name>`         | Scaffold a new RitaWapp application with generated 256-bit AES key.                |
| `rwa dev`                 | Start development server with HMR and launch native runtime with DevTools enabled. |
| `rwa dev --browser`       | Start runtime in browser fallback preview mode.                                    |
| `rwa installDev`          | Launch live preview of the native installer card.                                  |
| `rwa build`               | Compile release executable and encrypted bundle to `dist/bin/`.                    |
| `rwa test`                | Execute test suite across unit, contract, and security cases.                      |
| `rwa check`               | Strict TypeScript typecheck across entrypoints.                                    |
| `rwa doctor`              | Preflight environmental diagnostics and Deno tripwire check.                       |
| `rwa bench`               | Execute performance benchmarks.                                                    |
| `rwa packed`              | Build clean, consumable `@ritawapp/core` distributable archive.                    |
| `rwa release`             | Assemble release package with SHA-256 verification.                                |
| `rwa wsApi`               | Start the language-agnostic realtime WebSocket JSON-RPC 2.0 server.                |
| `rwa setup`               | Register global `rwa` launcher into User PATH.                                     |
| `rwa uninstall-global`    | Cleanly remove `rwa` launcher and user PATH entry.                                 |
| `rwa createModule <name>` | Scaffold a custom C11 and TypeScript module.                                       |
