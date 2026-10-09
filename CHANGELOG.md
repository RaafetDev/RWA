# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-10-08

### Added

- **wsApi Realtime JSON-RPC Server**: Full language-agnostic integration over
  WebSocket (`rwa wsApi`). Zero external dependencies needed on client
  applications.
- **Reference Clients**: C# Windows Forms App Manager sample
  (`RitaWappWsClient.cs`), Java, VB.NET, and Python clients.
- **`Model.paginate` & `Model.stream`**: Keyset pagination and asynchronous
  chunk streaming for large datasets in Mongoose ODM.
- **Zip-Slip Defense**: Mandatory path traversal containment and extraction
  checks in `admZip`.
- **Global Windows Command**: `rwa.cmd` launcher with automated registry and
  user PATH configuration (`rwa setup`).
- **AES-256-GCM Container Encryption**: Authenticated asset container format
  with 96-bit nonce and 128-bit authentication tag, retaining legacy CBC
  fallback.
- **Micro-Benchmark Suite**: Automated performance measurement suite
  (`Core/tests/benchmarks.ts`).

### Changed

- **Migration to Strict `Core/` Layout**: Replaced legacy multi-folder root
  (`RDevCore/`, `RitaWapp-ui/`, `ritawapp-modules/`) with pure `Core/`
  functional root.
- **Deno-Native Toolchain**: Complete elimination of Node.js, `npm`,
  `package.json`, and npm specifiers.
- **DevTools Security Policy**: Strict build-time compile gating ensuring
  DevTools are disabled and stripped from release binaries.
- **Module Count Canonicalization**: Formalized exact 18-module registry.
