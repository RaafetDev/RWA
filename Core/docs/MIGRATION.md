# RitaWapp Migration Guide (v1.0.0 → v1.0.1)

## 1. Directory Structure Migration

In v1.0.0, the repository contained multiple root folders:

- `RDevCore/`
- `RitaWapp-ui/`
- `ritawapp-modules/`

In v1.0.1, the repository is unified under a strict `Core/` layout:

```text
RitaWapp/
├── Core/
├── RitaWapp.ts
├── mod.ts
└── deno.json
```

## 2. Configuration & Module Migration

- Move `RitaWapp-config.ts` from root to inside your application folder as
  `RitaWapp.config.ts`.
- Replace legacy config aliases:
  - `trayEnable` / `trayEnabel` → `tray.enable`
  - `assetsMode` → `assetsMod`

## 3. Container Cipher Migration

- v1.0.0 containers used AES-256-CBC (`magic: RWAP, version: 1, cipher: 1`).
- v1.0.1 containers default to authenticated AES-256-GCM
  (`version: 2, cipher: 2`).
- The v1.0.1 native C runtime transparently supports reading legacy v1 CBC
  containers.
