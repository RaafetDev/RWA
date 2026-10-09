# RitaWapp Security Policy & Disclosure

## Security Principles

1. **Deno-Only Purity**: No insecure or untracked npm ecosystems. All
   dependencies are pinned or locally vendored.
2. **RAM-Only In-Memory Decryption**: Application bundles are encrypted using
   **AES-256-GCM** with a random 96-bit nonce and 128-bit authentication tag.
   Bundles are validated and decrypted strictly in memory via Windows BCrypt
   API.
3. **Zip-Slip Protection**: Path traversal entries (e.g. `../`) are strictly
   quarantined and rejected in AdmZip extraction.
4. **DevTools Release Policy**: DevTools, inspect context menus, and debug ports
   are compiled out in production releases.
5. **wsApi Security**: WebSocket server binds to loopback (`127.0.0.1`) by
   default, validates browser origins against CSWSH, and requires
   cryptographically secure 256-bit token authentication.

## Vulnerability Reporting

Please report security vulnerabilities to security@ritawapp.org.
