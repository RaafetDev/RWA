# RitaWapp Security & Audit Report (v1.0.1)

## Audit Findings & Mitigations

| Vulnerability Vector               | Risk     | Mitigation in v1.0.1                                                                                                                                                                                  |
| ---------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plaintext Bundle Extraction**    | High     | Frontend assets are encrypted via **AES-256-GCM** with a fresh 96-bit nonce and 128-bit authentication tag. Plaintext is decrypted solely in RAM through Windows BCrypt API and never stored on disk. |
| **DevTools in Production**         | High     | Release compiler strips `-DRITAWAPP_DEV` macro. Production executables unconditionally ignore `--devtools` flags and disable debug ports.                                                             |
| **Zip-Slip Directory Traversal**   | Critical | `admZip` verifies canonical destination boundaries. Any archive entry resolving outside the target directory is rejected with an error.                                                               |
| **Cross-Site WebSocket Hijacking** | High     | `wsApi` server validates `Origin` headers on WebSocket upgrade requests, rejecting non-loopback origins.                                                                                              |
| **Unauthorized wsApi Control**     | Critical | Cryptographic 256-bit token authentication stored in `%LOCALAPPDATA%\RitaWapp\wsapi.token` and compared in constant time.                                                                             |
| **Global Path Manipulation**       | Low      | `rwa setup` edits only `HKCU\Environment` User PATH, preserving existing paths and system security boundaries.                                                                                        |
