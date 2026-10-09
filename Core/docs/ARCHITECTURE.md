# RitaWapp Architecture Specification (v1.0.1)

## 1. System Overview

RitaWapp is an ultra-lightweight desktop application framework for Windows 7–11
(x64), combining:

- A pure **Deno** orchestrated toolchain and runtime manager.
- A compact **native C11 Win32 runtime** (`WinMain`) compiled with MinGW-w64
  GCC.
- **WebUI** and **Microsoft Edge WebView2 Evergreen** with silent local browser
  fallbacks.
- An encrypted asset container (`Rita.W.app`) decrypted strictly in RAM via
  Windows BCrypt.
- Embedded **SQLite 3** storage tuned for WAL mode with JSON1 and FTS5.
- Embedded **Cesanta Mongoose** networking engine running on a background worker
  loop.
- A language-agnostic **wsApi** WebSocket JSON-RPC 2.0 server.

## 2. Process Architecture

```text
[ RitaWapp.exe (WinMain) ]
    │
    ├── [ WebUI & WebView2 Controller ]
    │       └── Frontend UI (Vue 3 / HTML / CSS / JS) in RAM
    │
    ├── [ C11 RPC Dispatcher & Registry ] (ritawapp_modules.c)
    │       ├── SQLite Engine (rita_sqlite.c / WAL / FTS5 / Vector)
    │       ├── Cesanta Mongoose Loop (HTTP / WS / Sockets)
    │       └── 18 Integrated Native Modules
    │
    └── [ Win32 Background Message Loop ] (Tray icon & System Events)
```

## 3. Storage & Bundle Containment

1. **Normal Mode (`assetsMod: false`)**:
   - `dist/bin/RitaWappApp.exe`
   - `dist/bin/Rita.W.app` (AES-256-GCM encrypted frontend bundle)
   - `dist/bin/database.db` (SQLite database)
2. **Assets Mode (`assetsMod: true`)**:
   - `dist/bin/RitaWappApp.exe`
   - `dist/bin/data/Rita.W.app`
   - `dist/bin/data/database.db`
   - `dist/bin/data/assets/` (Static media, images, icons, publicly readable)
