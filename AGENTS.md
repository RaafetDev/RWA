# RitaWapp Repository Rules & Agent Guidelines

## 1. Deno-Only Tripwire & Pure Toolchain

- This project is **strictly Deno-only**.
- **Forbidden**: `package.json`, `package-lock.json`, `node_modules/`, `npm`,
  `npx`, `pnpm`, `yarn`, `bun`, and `npm:` specifiers.
- No Node-only dependencies or imports. All standard imports must use Deno
  built-ins, standard libraries (`https://deno.land/std` or JSR), or local
  files.
- The `doctor --deno-only` tripwire enforces functional purity.

## 2. Functional Root Purity

The root repository directory must contain ONLY:

```text
RitaWapp/
├── Core/
├── RitaWapp.ts
├── mod.ts
└── deno.json
```

Permitted repository metadata convention files:

- `README.md`, `LICENSE`, `SECURITY.md`, `CHANGELOG.md`, `AGENTS.md`,
  `.gitignore`, `.github/`

Functional code MUST live inside `Core/`. The global command `rwa.cmd` is
authored under `Core/cli/bin/rwa.cmd`.

## 3. Command Table

All tasks are executed via `deno task <task>` or `rwa <command>`:

- `init`: Scaffold a new RitaWapp application project.
- `dev`: Start dev server with HMR and launch native runtime in dev mode with
  DevTools enabled.
- `dev:browser`: Start dev server and launch runtime in browser fallback mode.
- `installDev`: Live preview of the installer card.
- `build`: Production compile and package to `dist/bin/` (DevTools disabled and
  stripped).
- `test`: Run all unit, integration, RPC, and security tests.
- `check`: Strict TypeScript typecheck across all entrypoints.
- `lint` / `fmt`: Linting and formatting with Deno.
- `doctor`: Environmental, compiler, and dependency preflight diagnostics.
- `bench`: Run performance benchmarks (SQLite, RPC, network, cold startup).
- `packed`: Build clean, consumable `@ritawapp/core` distributable archive and
  verify.
- `release`: Assemble GitHub Release package with SHA-256 verification.
- `createModule <name>`: Scaffold custom C + TS module.
- `setup`: Register global `rwa` Windows command into User PATH.
- `wsApi`: Start the language-agnostic JSON-RPC WebSocket API server.
