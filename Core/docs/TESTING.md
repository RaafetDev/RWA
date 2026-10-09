# RitaWapp Testing & Verification (v1.0.1)

## 1. Running Tests

Run the entire suite via:

```powershell
deno task test
```

Or via CLI:

```powershell
rwa test
```

## 2. Test Coverage

- **Purity Tripwire**: Verifies complete absence of Node.js dependencies,
  package files, and npm specifiers.
- **API Surface**: Asserts all public functions and interfaces are exported via
  `mod.ts`.
- **Module Count**: Validates exact count of 18 integrated modules against
  `registry.ts`.
- **Dependency Resolution**: Tests selective module trees (e.g. minimal vs full
  network stacks).
- **Configuration Compatibility**: Tests normalization of legacy config aliases
  (`trayEnable`, `assetsMode`).
- **Security Regressions**: Tests Zip-Slip path traversal defense.
- **wsApi Handshake**: Tests token authentication, error formatting, and method
  listing.
