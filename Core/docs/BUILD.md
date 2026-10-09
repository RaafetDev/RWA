# RitaWapp Build & Compilation Guide (v1.0.1)

## 1. Prerequisites

- **Deno** 2.x
- **MinGW-w64 GCC** 16.x (or modern x86_64 GCC toolchain with UCRT/MSVCRT)
- Windows 7–11 (x64)

## 2. Release Build Workflow

Execute:

```powershell
rwa build
```

The build pipeline executes in 7 deterministic steps:

1. Validates `RitaWapp.config.ts` and resolves enabled modules.
2. Synchronizes C preprocessor definitions in
   `Core/runtime/core/app_credentials.h`.
3. Encrypts frontend assets into `dist/bin/Rita.W.app` via AES-256-GCM.
4. Precompiles SQLite 3 engine and Cesanta Mongoose as static objects (`.dev/`).
5. Assembles all active C module handlers into the MinGW GCC compiler
   invocation.
6. Links native Windows executable `dist/bin/RitaWappApp.exe`.
7. Outputs an exact byte size measurement report.
