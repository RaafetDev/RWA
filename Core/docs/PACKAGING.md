# RitaWapp Packaging & Distributable Module Guide (v1.0.1)

## 1. Packed Pipeline Overview

`deno task packed` builds and validates the consumable `@ritawapp/core` package
archive.

## 2. Gate Verification Sequence

1. **Deno Tripwire**: Rejects any `package.json`, `node_modules`, or `npm:`
   specifier.
2. **Typecheck Gate**: `deno check mod.ts RitaWapp.ts`.
3. **Automated Test Gate**: Runs `deno test -A Core/tests/`.
4. **Allow-List Archive Creation**: Zips pure framework sources and assets into
   `dist/package/ritawapp-v1.0.1.zip` along with a SHA-256 hash manifest.
5. **Consumer Smoke Simulation**: Extracts the package into a temporary sandbox
   and executes an import test against `mod.ts`.
