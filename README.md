# RitaWapp v1.0.1

Ultra-lightweight, high-performance Windows desktop application framework
combining C11 native performance with modern web UI technologies (Vue 3 +
TypeScript / Vanilla JS).

> **Pure Deno Toolchain:** **Node.js, npm, package.json, and node_modules are
> strictly not required and forbidden.** RitaWapp runs on a pure Deno runtime
> and MinGW-w64 GCC native compiler.

---

## Highlights

- **Standalone Native Executable**: Native Win32 C11 runtime with embedded
  `WebView2Loader.dll` and embedded PE application icon.
- **Hardware-Accelerated AES-256-GCM Container**: Production web assets are
  encrypted into `Rita.W.app` and decrypted strictly in RAM via Windows BCrypt
  primitives (zero plaintext written to disk).
- **Embedded SQLite 3 Engine**: High-performance WAL mode, memory-mapped cache,
  JSON1, and FTS5 full-text search. Temporary tables and spill memory write to
  Windows `%TEMP%`, and temp journal files (`-wal`/`-shm`) are automatically
  checkpointed and cleaned on exit.
- **Cesanta Mongoose Networking**: Background network loop powering TCP (`net`),
  UDP (`dgram`), HTTP microserver, WebSocket client/server, and lightweight
  Express routing.
- **19 Selective Native & Integrated Modules**: On-demand compilation of
  `appWindow`, `database`, `mongoose-sqlite` (Mongoose ODM for SQLite JSON),
  `fs`, `os`, `path`, `process`, `shell`, `network`, `update`, `cloudSync`,
  `tray`, `net`, `dgram`, `http`, `fetch`, `express`, `ws`, `admZip`.
- **Live-Reloading Dev Server**: Instant hot-reload on frontend changes, with
  Chromium DevTools enabled (`F12` / `Ctrl+Shift+I`).
- **AI Agent & Developer Datasets**: Every scaffolded application automatically
  includes `Agent.md` (AI coding dataset) and `Doc.md` (full developer
  documentation).
- **Realtime wsApi**: Language-agnostic WebSocket JSON-RPC server (`rwa wsApi`)
  allowing C#, Java, Python, and VB.NET desktop automation.

---

## Quick Start

### 1. Register Global CLI (`rwa`)

From the RitaWapp framework repository root:

```powershell
deno task setup
```

This registers the global `rwa` Windows command into your User PATH.

### 2. Scaffold a New Project

```powershell
rwa init MyApp
cd MyApp
```

The interactive wizard allows selecting between:

- **Vue 3 + TypeScript SPA** (Rich desktop UI with Tailwind-inspired styling)
- **Vanilla JavaScript + HTML5** (Pure lightweight, zero build step)
- Module presets (**Full 19 modules**, **Minimal**, or **Custom selection**)

Every initialized project contains `Agent.md` and `Doc.md` ready for immediate
use.

### 3. Run in Development Mode

```powershell
rwa dev
```

- Starts the Deno live-reload dev server at `http://127.0.0.1:5173`.
- Launches the native Windows runtime connected to the live dev server.
- Press **F12** or **Ctrl+Shift+I** anytime to open DevTools.
- Edits to frontend code reload the webview instantly without restarting the
  binary.

### 4. Build Production Standalone Executable

```powershell
rwa build
```

- Encrypts `dist/index.html` into `dist/bin/Rita.W.app` (AES-256-GCM).
- Compiles the native Win32 executable (`dist/bin/<AppName>.exe`) with embedded
  icon via `windres`.
- Strips debugging symbols and DevTools shortcuts.

### 5. Run Production Binary

```powershell
rwa run
```

Or double-click `dist/bin/<AppName>.exe`.

---

## CLI Command Reference

All operations can be run via `rwa <command>` or `deno task <task>`:

| Command           | Description                                               |
| ----------------- | --------------------------------------------------------- |
| `rwa init [name]` | Interactive project creation wizard with module selection |
| `rwa dev`         | Start live-reload development server and native runtime   |
| `rwa build`       | Encrypt frontend bundle and compile production executable |
| `rwa run`         | Launch compiled standalone application binary             |
| `rwa doctor`      | Environmental preflight (Deno-only purity, GCC, WebView2) |
| `rwa bench`       | Performance benchmarks (SQLite WAL, BCrypt, cold startup) |
| `rwa packed`      | Build clean distributable framework archive               |
| `rwa release`     | Assemble release package with SHA-256 verification        |
| `rwa wsApi`       | Start language-agnostic WebSocket JSON-RPC server         |
| `rwa setup`       | Register global `rwa` command in Windows User PATH        |

---

## Architecture & Layout

```text
RitaWapp/
├── Core/                       # Framework engine, toolchain, and modules
│   ├── cli/                    # CLI router, init wizard, logger, and diagnostics
│   ├── config/                 # RitaWapp.json parser and schema validation
│   ├── docs/                   # Architectural specifications and manuals
│   ├── modules/                # 18 native and TypeScript-integrated modules
│   ├── runtime/                # C11 native runtime, WebUI IPC, and SQLite
│   ├── templates/              # Vue 3+TS and Vanilla templates (with Agent.md & Doc.md)
│   └── toolchain/              # Dev server, AES-256-GCM compiler, and packer
├── RitaWapp.ts                 # CLI entry point
├── mod.ts                      # Framework module export
├── deno.json                   # Deno tasks, compiler options, and lint rules
└── AGENTS.md                   # Framework repository agent rules
```

---

## License

MIT License. Copyright (c) RitaWapp Contributors.
