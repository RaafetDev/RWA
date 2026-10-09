# RitaWapp Release & Distribution Guide (v1.0.1)

## 1. Release Packaging

Run:

```powershell
rwa release
```

This generates:

- Compiled Windows executable: `dist/bin/RitaWappApp.exe`
- Encrypted asset bundle: `dist/bin/Rita.W.app`
- Database: `dist/bin/database.db`
- Distributable zip: `dist/package/ritawapp-v1.0.1.zip`
- Hash manifest: `dist/package/ritawapp-v1.0.1.zip.sha256`

## 2. Integrity Verification

All release assets are hashed with SHA-256 and checked prior to staging and
installation.
