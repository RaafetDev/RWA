# RitaWapp Master Developer Documentation & API Reference

Welcome to the definitive developer guide for **RitaWapp**, the high-performance desktop framework for Windows 7–11 (x64) powered by a native C11 runtime, Microsoft Edge WebView2, and Vue 3 + TypeScript.

---

## Table of Contents

1. [Architecture & Execution Model](#1-architecture--execution-model)
2. [Quick Start & CLI Toolchain](#2-quick-start--cli-toolchain)
3. [Project Configuration (`RitaWapp.json`)](#3-project-configuration-ritawappjson)
4. [The RitaWapp RPC Bridge](#4-the-ritawapp-rpc-bridge)
5. [Complete API Reference (All 18 Native Modules)](#5-complete-api-reference-all-18-native-modules)
   - [appWindow (Window Controls & DevTools)](#51-appwindow)
   - [os (Operating System & Hardware Signature)](#52-os)
   - [fs (Native File System)](#53-fs)
   - [shell (Command Execution & Shell Integration)](#54-shell)
   - [process (Process Control & Environment)](#55-process)
   - [database (Embedded SQLite 3 WAL Engine)](#56-database)
   - [network (Adapters, Ping, DNS)](#57-network)
   - [tray (Windows System Tray)](#58-tray)
   - [update (In-App Binary Updater)](#59-update)
   - [cloudSync (Encrypted Cloud Synchronizer)](#510-cloudsync)
   - [net (Low-Level TCP Sockets)](#511-net)
   - [dgram (UDP Datagram Sockets)](#512-dgram)
   - [http (Embedded Micro HTTP Server)](#513-http)
   - [fetch (HTTP/HTTPS Fetch Client)](#514-fetch)
   - [express (Lightweight Express Routing)](#515-express)
   - [ws (WebSocket Client & Server)](#516-ws)
   - [admZip (Native Zip Archive Handler)](#517-admzip)
   - [path (Cross-Platform Path Utilities)](#518-path)
6. [Developing Custom Native C Modules (`custom_module/`)](#6-developing-custom-native-c-modules-custom_module)
7. [Frameless Windows & Draggable Titlebars](#7-frameless-windows--draggable-titlebars)
8. [Security, Cryptography & Production Packaging](#8-security-cryptography--production-packaging)
9. [Troubleshooting & FAQ](#9-troubleshooting--faq)

---

## 1. Architecture & Execution Model

RitaWapp eliminates the heavy memory overhead and Node.js runtime bloat of legacy frameworks by marrying a lean, hardware-accelerated C11 Win32 engine directly to the native Windows Microsoft Edge WebView2 Evergreen runtime.

```text
┌─────────────────────────────────────────────────────────────────┐
│                        RitaWapp Desktop                         │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                Vue 3 + TypeScript Frontend                │  │
│  │           (Components, Reactive State, Pinia, UI)         │  │
│  └─────────────────────────────┬─────────────────────────────┘  │
│                                │                                │
│                     WebUI Bidirectional IPC                     │
│               (window.rita_module_call / WebSocket)             │
│                                │                                │
│  ┌─────────────────────────────▼─────────────────────────────┐  │
│  │                     Native C11 Runtime                    │  │
│  │                                                           │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌───────────────────┐  │  │
│  │  │ SQLite 3 WAL │ │  Mongoose    │ │  18 C RPC Modules │  │  │
│  │  │ (Embedded DB)│ │ (Networking) │ │ (FS, OS, Tray...) │  │  │
│  │  └──────────────┘ └──────────────┘ └───────────────────┘  │  │
│  │  ┌───────────────────────────────┐ ┌───────────────────┐  │  │
│  │  │   Windows BCrypt (AES-256)    │ │ Win32 / DWM Comps │  │  │
│  │  └───────────────────────────────┘ └───────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Execution Characteristics
- **Zero Node.js Runtime**: Strictly Deno-orchestrated tooling. The built executable contains zero JavaScript interpreters on the native side; your UI executes within the isolated Chromium engine provided by WebView2.
- **Pure In-Memory Asset Decryption**: In production (`rwa build`), your HTML, CSS, and JS bundle are compiled into an encrypted container `dist/bin/Rita.W.app` (AES-256-GCM). At launch, the C engine decrypts the container directly into RAM via hardware-accelerated Windows BCrypt primitives. No decrypted assets ever touch disk.
- **Teardown Zeroization**: Upon window exit, cryptographic buffers and keys are zeroed in RAM via `SecureZeroMemory()`.

---

## 2. Quick Start & CLI Toolchain

All lifecycle commands are managed via the global `rwa` tool:

### 2.1 Development Mode (`rwa dev`)
```powershell
rwa dev
```
- Starts the local live-reloading dev server at `http://127.0.0.1:5173`.
- Launches the native Windows executable connected directly to the dev server.
- **Hot-Reloading**: Edits to `.vue`, `.ts`, `.html`, or `.css` reload the webview instantly without terminating the native process.
- **Native Recompilation**: Modifying `RitaWapp.json`, files in `custom_module/`, or native `.c` / `.h` files automatically triggers MinGW GCC recompilation and restarts the runtime process.
- **DevTools**: Press **F12** or **Ctrl+Shift+I** anytime in development mode to toggle the Chromium DevTools inspector.

### 2.2 Production Build (`rwa build`)
```powershell
rwa build
```
- Encrypts your frontend code into `dist/bin/Rita.W.app` using **AES-256-GCM**.
- Compiles the standalone executable `dist/bin/<AppName>.exe` with MinGW-w64 GCC (`-Os` size optimization).
- Compiles `app.ico` into a Windows PE resource object via `windres` and embeds it directly into the executable header.
- Strips debugging symbols and disables DevTools keyboard shortcuts.

### 2.3 Running Standalone Release (`rwa run`)
```powershell
rwa run
```
Or directly double-click `dist/bin/<AppName>.exe`.

### 2.4 Diagnostic Preflight (`rwa doctor`)
```powershell
rwa doctor
```
Runs 6 verification checks:
1. Purity Tripwire (verifies absence of forbidden `package.json`, `node_modules`, `npm:` specifiers)
2. Deno Version (requires 2.0+)
3. MinGW-w64 GCC Compiler availability
4. Windows x86_64 Host Platform
5. WebView2Loader embed library
6. Global `rwa` binary resolution in Windows PATH

---

## 3. Project Configuration (`RitaWapp.json`)

The application configuration resides in `RitaWapp.json` at the root of your project:

```json
{
  "app": {
    "name": "MyRitaApp",
    "displayName": "My Application Desktop",
    "version": "1.0.0",
    "appId": "com.ritawapp.myapp",
    "description": "My Desktop Application",
    "appIcon": "app.ico"
  },
  "window": {
    "title": "My Application Desktop",
    "width": 1024,
    "height": 720,
    "minWidth": 400,
    "minHeight": 300,
    "resizable": true,
    "frameless": true,
    "transparent": false,
    "center": true
  },
  "installer": {
    "title": "Setting up runtime",
    "subtitle": "Installing Microsoft WebView2 components...",
    "width": 480,
    "height": 220,
    "backgroundColor": "#1e1e24",
    "accentColor": "#3b82f6",
    "textColor": "#f3f4f6",
    "accentHeight": 4
  },
  "tray": {
    "enable": false,
    "tooltip": "My Application Desktop",
    "icon": "app.ico",
    "hideToTrayOnMinimize": false,
    "items": []
  },
  "modules": "all",
  "assetsMod": false,
  "security": {
    "aesKey": "e4a2d8f9c105b3e7a684d021c5f89b34e1207865c349d821fa560912bc345678",
    "cipher": "AES-256-GCM"
  },
  "compiler": {
    "appBrowserMode": "webview2AutoInstall",
    "gccPath": "gcc",
    "optimization": "-Os",
    "extraFlags": []
  }
}
```

### Configuration Property Reference

| Property | Type | Default | Description |
|---|---|---|---|
| `app.name` | `string` | `"MyRitaApp"` | Machine identifier and executable base name. |
| `app.displayName` | `string` | `"..."` | Human-friendly title shown in UI and installer. |
| `app.version` | `string` | `"1.0.0"` | SemVer version string. |
| `app.appId` | `string` | `"com..."` | Windows Application User Model ID (AUMID). |
| `app.appIcon` | `string` | `"app.ico"` | Application icon path relative to project root. |
| `window.width` | `number` | `1024` | Initial window width in pixels. |
| `window.height` | `number` | `720` | Initial window height in pixels. |
| `window.minWidth` | `number` | `400` | Minimum allowed resize width. |
| `window.minHeight` | `number` | `300` | Minimum allowed resize height. |
| `window.resizable` | `boolean` | `true` | Allows user resizing of window borders. |
| `window.frameless` | `boolean` | `true` | Removes standard OS title bar and borders. |
| `window.transparent`| `boolean`| `false` | Enables alpha-channel window transparency. |
| `window.center` | `boolean` | `true` | Centers window on primary monitor at launch. |
| `tray.enable` | `boolean` | `false` | Places an icon in the Windows notification area. |
| `tray.tooltip` | `string` | `""` | Tooltip displayed when hovering tray icon. |
| `tray.hideToTrayOnMinimize` | `boolean` | `false` | Hides taskbar button when minimized. |
| `modules` | `string \| string[]` | `"all"` | Modules to compile: `"all"`, `"minimal"`, or array of module names. |
| `assetsMod` | `boolean` | `false` | When `true`, bundle is loaded from `./data/Rita.W.app`. |
| `security.aesKey` | `string` | `""` | 64-character hexadecimal 256-bit AES encryption key. |
| `security.cipher` | `string` | `"AES-256-GCM"` | Cipher mode: authenticated `"AES-256-GCM"`. |
| `compiler.appBrowserMode` | `string` | `"webview2AutoInstall"` | `"webview2AutoInstall"`, `"webview2"`, `"chrome"`, `"edge"`, or `"all"`. |
| `compiler.optimization` | `string` | `"-Os"` | GCC compiler optimization flag (`-Os`, `-O2`, `-O3`). |

---

## 4. The RitaWapp Zero-Import Global Architecture & RPC Bridge

### 4.1 Zero-Import Global Architecture (`createApp(App).use(RitaWapp)`)
RitaWapp eliminates repetitive module imports. In your `main.ts`, simply register the plugin:
```typescript
import { createApp } from "vue";
import { RitaWapp } from "./RitaWapp.ts";
import App from "./App.vue";

createApp(App).use(RitaWapp).mount("#app");
```
Once initialized, **zero imports are needed anywhere in your application**:
- **In `<script setup>` or `.ts` files**: `fs`, `os`, `path`, `process`, `shell`, `appWindow`, `webUI`, `mongoose`, `Schema`, `db`, `network`, `update`, `tray`, `net`, `dgram`, `http`, `https`, `desktopFetch`, `fetch`, `express`, `ws`, `WebSocket`, `AdmZip`, `isModuleEnabled`, `getAssetUrl`, etc., are directly accessible as bare global identifiers.
- **In Vue `<template>`**: All modules are available as `$fs` / `fs`, `$os` / `os`, `$db` / `db`, `$webUI` / `webUI`, `$mongoose` / `mongoose`, etc.
- **In Window / DevTools**: Available on `window.fs`, `window.os`, `window.mongoose`, `window.db`, etc.
- **TypeScript Autocomplete**: Automatically typed via `ritawapp.d.ts` ambient declarations.

### 4.2 Low-Level Invocations
```typescript
const responseRaw = await window.rita_module_call(JSON.stringify({
  module: "os",
  action: "getMemory",
  args: []
}));

const response = JSON.parse(responseRaw);
// Structure: { success: boolean, data?: any, error?: string }
if (response.success) {
  console.log("Memory info:", response.data);
} else {
  console.error("Error:", response.error);
}
```

---

## 5. Complete API Reference (All 19 Native & Integrated Modules)

### 5.1 `appWindow`
Controls the native Win32 window, dimensions, styling, and DevTools inspector.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `close()` | None | `Promise<void>` | Closes the window and terminates process. |
| `minimize()` | None | `Promise<void>` | Minimizes the window to taskbar. |
| `maximize()` | None | `Promise<void>` | Toggles between maximized and restored state. |
| `restore()` | None | `Promise<void>` | Restores a minimized or maximized window. |
| `isMaximized()` | None | `Promise<boolean>` | Returns `true` if window is currently maximized. |
| `setTitle(title)` | `title: string` | `Promise<boolean>` | Dynamically updates the native window title. |
| `setSize(w, h)` | `w: number, h: number` | `Promise<boolean>` | Sets window dimensions in pixels. |
| `getSize()` | None | `Promise<{ width: number, height: number }>` | Gets current window width and height. |
| `setPosition(x, y)` | `x: number, y: number` | `Promise<boolean>` | Moves window to screen coordinates (x, y). |
| `getPosition()` | None | `Promise<{ x: number, y: number }>` | Gets current screen coordinates. |
| `setFrameless(bool)` | `frameless: boolean` | `Promise<boolean>` | Toggles frameless Win32 window border style. |
| `setTransparent(bool)`| `transparent: boolean`| `Promise<boolean>` | Toggles window transparency. |
| `center()` | None | `Promise<boolean>` | Centers window on the active display monitor. |
| `openDevTools()` | None | `Promise<boolean>` | Programmatically opens Chromium DevTools. |

#### Example:
```typescript
// Minimize window
await window.appWindow.minimize();

// Resize and center
await window.appWindow.setSize(1280, 800);
await window.appWindow.center();

// Toggle maximize
const isMax = await window.appWindow.isMaximized();
if (isMax) {
  await window.appWindow.restore();
} else {
  await window.appWindow.maximize();
}
```

---

### 5.2 `os`
Provides hardware, CPU, memory, and unique cryptographic machine identification.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `getPlatform()` | None | `Promise<string>` | Returns `"win32"`. |
| `getArch()` | None | `Promise<string>` | Returns `"x64"`. |
| `getHostname()` | None | `Promise<string>` | Gets local machine network hostname. |
| `getCpus()` | None | `Promise<{ model: string, cores: number }>` | CPU brand string and logical core count. |
| `getUptime()` | None | `Promise<number>` | Operating system uptime in seconds. |
| `getMemory()` | None | `Promise<{ total: number, free: number, used: number }>` | Total, free, and used RAM in bytes. |
| `getHomeDir()` | None | `Promise<string>` | User's home profile directory path. |
| `getHardwareFingerprint()` | None | `Promise<{ cpuId: string, hardDriveId: string, motherboardId: string, fingerprint: string }>` | Hardware IDs and combined SHA-256 machine signature. |

#### Example:
```typescript
const mem = await window.os.getMemory();
console.log(`RAM: ${(mem.used / 1e9).toFixed(1)} GB / ${(mem.total / 1e9).toFixed(1)} GB`);

const hw = await window.os.getHardwareFingerprint();
console.log(`Hardware SHA-256 Fingerprint: ${hw.fingerprint}`);
```

---

### 5.3 `fs`
Ultra-fast native Win32 file system operations without Node.js dependencies.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `readFile(path)` | `path: string` | `Promise<string>` | Reads entire file as a UTF-8 string. |
| `writeFile(path, data)`| `path: string, data: string` | `Promise<boolean>` | Writes string content to file. |
| `exists(path)` | `path: string` | `Promise<boolean>` | Checks if file or directory exists. |
| `readDir(path)` | `path: string` | `Promise<string[]>` | Lists directory entry names. |
| `remove(path)` | `path: string` | `Promise<boolean>` | Deletes a file or empty directory. |
| `copy(src, dest)` | `src: string, dest: string` | `Promise<boolean>` | Copies file from src to dest. |
| `mkdir(path)` | `path: string` | `Promise<boolean>` | Creates a directory (and parents if needed). |
| `stat(path)` | `path: string` | `Promise<{ size: number, isDirectory: boolean, modified: number }>` | Retrieves file size, attributes, and timestamp. |

#### Example:
```typescript
const appDataFile = "C:\\Users\\Admin\\AppData\\Local\\MyApp\\settings.json";

if (await window.fs.exists(appDataFile)) {
  const content = await window.fs.readFile(appDataFile);
  const settings = JSON.parse(content);
  console.log("Settings loaded:", settings);
} else {
  await window.fs.mkdir("C:\\Users\\Admin\\AppData\\Local\\MyApp");
  await window.fs.writeFile(appDataFile, JSON.stringify({ theme: "dark" }));
}
```

---

### 5.4 `shell`
Launches native Windows commands and integrates with the Windows shell.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `execute(command)` | `command: string` | `Promise<{ exitCode: number, stdout: string, stderr: string }>` | Executes command synchronously via `cmd.exe /c`. |
| `openExternal(target)` | `target: string` | `Promise<boolean>` | Opens URL, file, or protocol in default Windows application. |

#### Example:
```typescript
// Execute shell command
const res = await window.shell.execute("ipconfig /all");
console.log("Network configuration:\n", res.stdout);

// Open external website
await window.shell.openExternal("https://github.com");

// Open file with default registered application
await window.shell.openExternal("C:\\report.pdf");
```

---

### 5.5 `process`
Process management, memory telemetry, and environment variable access.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `getPid()` | None | `Promise<number>` | Current process identifier (PID). |
| `getMemoryUsage()` | None | `Promise<{ workingSet: number, privateBytes: number }>` | Resident working set memory in bytes. |
| `getEnv(name)` | `name: string` | `Promise<string>` | Retrieves value of an environment variable. |
| `kill(pid)` | `pid: number` | `Promise<boolean>` | Terminates a process by PID. |

#### Example:
```typescript
const pid = await window.process.getPid();
const mem = await window.process.getMemoryUsage();
console.log(`PID: ${pid}, RAM: ${(mem.workingSet / 1024 / 1024).toFixed(2)} MB`);

const userPath = await window.process.getEnv("PATH");
```

---

### 5.6 `database`
Embedded SQLite 3 engine operating in Write-Ahead Logging (WAL) mode. The database file (`database.db`) is stored alongside the executable.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `query(sql, params)` | `sql: string, params?: any[]` | `Promise<any[]>` | Executes a SELECT statement with prepared parameters. |
| `execute(sql, params)` | `sql: string, params?: any[]` | `Promise<{ changes: number, lastInsertRowid: number }>` | Executes INSERT, UPDATE, DELETE statements. |
| `transaction(stmts)` | `stmts: { sql: string, params?: any[] }[]` | `Promise<boolean>` | Executes a series of statements inside an atomic transaction. |
| `getStats()` | None | `Promise<{ path: string, walMode: boolean, pageCount: number, pageSize: number }>` | Database storage metrics and WAL status. |

#### Example:
```typescript
// Initialize table
await window.database.execute(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Insert record
const insertResult = await window.database.execute(
  "INSERT INTO notes (title, content) VALUES (?, ?)",
  ["Meeting Notes", "Discuss Q4 release schedule."]
);
console.log(`Inserted note ID: ${insertResult.lastInsertRowid}`);

// Query records
const notes = await window.database.query(
  "SELECT id, title, created_at FROM notes ORDER BY id DESC"
);
console.log("Notes in database:", notes);

#### Clean Temporary Lifecycle:
- **Temporary Storage**: All internal SQLite sorting, spill caches, and temporary tables are automatically directed to the Windows `%TEMP%` directory (`GetTempPathA()`).
- **WAL Auto-Checkpoint**: On application shutdown, a full `SQLITE_CHECKPOINT_TRUNCATE` is executed. All WAL pages are folded into `database.db`, and temporary `-wal` and `-shm` files are removed automatically so zero leftover files clutter your executable folder.

---

### 5.7 `mongoose-sqlite` (Node.js Mongoose ODM Port)
A full-featured Node.js Mongoose ODM port backed by the embedded SQLite JSON engine. Provides Schemas, Models, validation, middleware, timestamps, and a fluent query builder.

| Method / Feature | Description |
|---|---|
| `new Schema(definition, options)` | Creates a Mongoose schema with type validation, defaults, and `{ timestamps: true }`. |
| `model(name, schema)` | Compiles and returns a Mongoose Model instance. |
| `Model.create(doc \| docs[])` | Inserts one or more documents and generates a 24-character hexadecimal `_id`. |
| `Model.find(filter)` | Returns a fluent `Query` builder supporting `.where()`, `.equals()`, `.gt()`, `.sort()`, `.limit()`, `.skip()`, `.exec()`. |
| `Model.findOne(filter)` | Finds the first matching document. |
| `Model.findById(id)` | Finds document by `_id`. |
| `Model.findByIdAndUpdate(id, update, { new: true })` | Updates document by ID and returns modified document. |
| `Model.findByIdAndDelete(id)` | Deletes document by ID. |
| `Model.updateOne(filter, update)` | Updates single document. |
| `Model.updateMany(filter, update)` | Updates all matching documents. |
| `Model.deleteOne(filter)` | Deletes single matching document. |
| `Model.deleteMany(filter)` | Deletes all matching documents. |
| `Model.countDocuments(filter)` | Returns count of matching documents. |
| `Model.distinct(field, filter)` | Returns array of distinct field values. |
| `Model.paginate(filter, { limit, page })` | Keyset pagination for desktop tables. |
| `Model.stream(filter, chunkSize)` | Async generator for streaming large collections chunk-by-chunk. |
| `doc.save()` | Explicitly flushes document to SQLite (optional; property changes auto-save automatically!). |
| `doc.remove()` / `doc.deleteOne()` | Deletes document instance from SQLite. |

#### Example (Zero Imports & Reactive Auto-Save):
```typescript
// Zero imports needed! mongoose and Schema are globally available via createApp(App).use(RitaWapp)
const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  age: { type: Number, default: 18 },
  role: { type: String, default: 'user' },
  active: { type: Boolean, default: true }
}, {
  timestamps: true // Automatically manages createdAt and updatedAt
});

// 1. Compile Model (callable both as a class and with static methods)
const User = mongoose.model('User', UserSchema);

// 2. Create document via User.create or new User()
const user = await User.create({
  name: 'Sarah Connor',
  email: 'sarah@example.com',
  age: 28
});
console.log('User created with _id:', user._id);

// 3. Query with fluent builder
const adults = await User.find()
  .where('age').gte(18)
  .where('active').equals(true)
  .sort({ age: -1 })
  .limit(20)
  .exec();

// 4. Reactive Auto-Save: No doc.save() required!
// Modifying properties automatically debounces and saves directly to SQLite:
user.age = 29;
user.role = 'commander';

// Calling user.save() is completely optional:
await user.save();
```

---

### 5.8 `network`
Network adapter discovery, ICMP ping probes, and DNS resolution.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `getInterfaces()` | None | `Promise<Array<{ name: string, ip: string, mac: string, isUp: boolean }>>` | Enumerates local network adapters. |
| `ping(host)` | `host: string` | `Promise<{ success: boolean, timeMs: number }>` | Probes host connectivity and latency. |
| `resolveDns(hostname)`| `hostname: string` | `Promise<string[]>` | Resolves DNS hostname into IPv4/IPv6 addresses. |

#### Example:
```typescript
const adapters = await window.network.getInterfaces();
console.log("Active adapters:", adapters.filter(a => a.isUp));

const pingResult = await window.network.ping("1.1.1.1");
console.log(`Ping: ${pingResult.success ? `${pingResult.timeMs}ms` : 'Failed'}`);
```

---

### 5.8 `tray`
Integrates with the Windows Taskbar Notification Area (System Tray).

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `create(tooltip, icon)` | `tooltip: string, icon?: string` | `Promise<boolean>` | Creates tray icon with tooltip. |
| `destroy()` | None | `Promise<boolean>` | Removes tray icon. |
| `setTooltip(tooltip)` | `tooltip: string` | `Promise<boolean>` | Updates tooltip string. |
| `setIcon(iconPath)` | `iconPath: string` | `Promise<boolean>` | Replaces tray icon image. |
| `hideToTray(hide)` | `hide: boolean` | `Promise<boolean>` | Hides main window from taskbar into tray. |

#### Example:
```typescript
await window.tray.create("MyRitaApp - Running in Background", "app.ico");

// Hide window to tray on minimize
await window.tray.hideToTray(true);
```

---

### 5.9 `update`
In-app binary update management and self-replacement.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `checkForUpdates(url)` | `url: string` | `Promise<{ hasUpdate: boolean, version: string, url: string }>` | Fetches update manifest. |
| `downloadUpdate(url, dest)` | `url: string, dest: string` | `Promise<boolean>` | Downloads binary package. |
| `applyUpdate(updateExe)` | `updateExe: string` | `Promise<boolean>` | Replaces current binary and restarts. |

#### Example:
```typescript
const update = await window.update.checkForUpdates("https://updates.example.com/version.json");
if (update.hasUpdate) {
  const downloaded = await window.update.downloadUpdate(update.url, "C:\\Temp\\update.exe");
  if (downloaded) {
    await window.update.applyUpdate("C:\\Temp\\update.exe");
  }
}
```

---

### 5.10 `cloudSync`
Encrypted state synchronization between local SQLite and remote endpoints.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `setSyncEndpoint(url, key)`| `url: string, key: string` | `Promise<boolean>` | Configures remote sync API credentials. |
| `pushSync(data)` | `data: any` | `Promise<boolean>` | Pushes encrypted state payload to cloud. |
| `pullSync()` | None | `Promise<any>` | Pulls latest state from cloud. |
| `getSyncStatus()` | None | `Promise<{ inSync: boolean, lastSyncTimestamp: number }>` | Returns synchronization status. |

---

### 5.11 `net`
Raw TCP socket streaming powered by embedded Cesanta Mongoose.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `createConnection(host, port)` | `host: string, port: number` | `Promise<{ connId: string }>` | Establishes outbound TCP socket. |
| `send(connId, data)` | `connId: string, data: string` | `Promise<boolean>` | Writes string/binary data over TCP. |
| `close(connId)` | `connId: string` | `Promise<boolean>` | Gracefully terminates TCP connection. |

#### Example:
```typescript
const { connId } = await window.net.createConnection("echo.u-strasbg.fr", 7);
await window.net.send(connId, "PING");
await window.net.close(connId);
```

---

### 5.12 `dgram`
UDP datagram socket creation and packet broadcasting.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `createSocket(port)` | `port?: number` | `Promise<{ socketId: string }>` | Binds local UDP socket. |
| `send(socketId, host, port, data)` | `...` | `Promise<boolean>` | Dispatches UDP datagram. |
| `close(socketId)` | `socketId: string` | `Promise<boolean>` | Closes UDP socket. |

---

### 5.13 `http`
Embedded micro HTTP server running within the C runtime process.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `createServer(port)` | `port: number` | `Promise<{ serverId: string, port: number }>` | Launches background HTTP server. |
| `request(options)` | `options: { url: string, method?: string, headers?: Record<string, string>, body?: string }` | `Promise<{ status: number, body: string }>` | Native HTTP client request. |
| `close(serverId)` | `serverId: string` | `Promise<boolean>` | Terminates HTTP microserver. |

#### Example:
```typescript
// Start a local microserver on port 8080
const server = await window.http.createServer(8080);
console.log(`Server listening on port: ${server.port}`);

// Fetch from remote API natively
const resp = await window.http.request({
  url: "https://api.github.com/zen",
  method: "GET",
  headers: { "User-Agent": "RitaWapp" }
});
console.log("GitHub Zen:", resp.body);
```

---

### 5.14 `fetch`
Portable HTTP client interface.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `request(url, options)` | `url: string, options?: any` | `Promise<{ ok: boolean, status: number, data: any }>` | Executes HTTP request. |

---

### 5.15 `express`
Lightweight Express-style route declaration for embedded C HTTP services.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `createServer(port)` | `port: number` | `Promise<{ serverId: string }>` | Allocates router instance. |
| `route(serverId, path, method, response)` | `...` | `Promise<boolean>` | Maps HTTP path to JSON response. |
| `listen(serverId)` | `serverId: string` | `Promise<boolean>` | Starts listening for incoming requests. |

---

### 5.16 `ws`
High-speed WebSocket client and server.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `createServer(port)` | `port: number` | `Promise<{ wsServerId: string }>` | Creates local WebSocket server. |
| `createClient(url)` | `url: string` | `Promise<{ wsClientId: string }>` | Connects to remote WebSocket server. |
| `send(id, message)` | `id: string, message: string` | `Promise<boolean>` | Sends WebSocket text frame. |
| `close(id)` | `id: string` | `Promise<boolean>` | Terminates WebSocket session. |

---

### 5.17 `admZip`
Native archive compression and extraction.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `extract(zipPath, destDir)` | `zipPath: string, destDir: string` | `Promise<boolean>` | Extracts ZIP archive to folder. |
| `compress(sourceDir, zipPath)` | `sourceDir: string, zipPath: string` | `Promise<boolean>` | Packs directory into ZIP file. |

#### Example:
```typescript
await window.admZip.compress("C:\\Projects\\MyData", "C:\\Backup\\data.zip");
await window.admZip.extract("C:\\Backup\\data.zip", "C:\\Restored");
```

---

### 5.18 `path`
Cross-platform path resolution and manipulation routines.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `join(...segments)` | `...string[]` | `string` | Joins path segments using Windows separators. |
| `resolve(...segments)` | `...string[]` | `string` | Resolves absolute path. |
| `basename(p, ext)` | `p: string, ext?: string` | `string` | Returns filename with optional extension removal. |
| `dirname(p)` | `p: string` | `string` | Returns directory portion of path. |
| `extname(p)` | `p: string` | `string` | Returns file extension (e.g., `".png"`). |
| `isAbsolute(p)` | `p: string` | `boolean` | Checks if path is absolute. |

---

## 6. Developing Custom Native C Modules (`custom_module/`)

RitaWapp is built to be easily extended with custom C code. You can integrate third-party C libraries, Win32 hardware drivers, or heavy mathematical computations.

### 6.1 Directory Structure
Place your custom module code in `custom_module/`:
```text
custom_module/
├── my_module.c       # Native C implementation
├── my_module.h       # C header prototypes
├── my_module.ts      # TypeScript wrapper for Vue 3
└── README.md         # Documentation
```

### 6.2 Writing the C Handler (`custom_module/my_module.c`)
```c
#include "my_module.h"
#include <stdio.h>
#include <string.h>
#include <windows.h>
#include "../Core/runtime/rpc/ritawapp_modules.h"

void handle_my_custom_module(
    size_t window,
    const char* action,
    const char* json_request,
    char* response,
    size_t max_resp
) {
    RW_UNUSED(window);
    RW_UNUSED(json_request);

    if (strcmp(action, "getSystemTicks") == 0) {
        DWORD ticks = GetTickCount();
        snprintf(response, max_resp,
            "{\"success\":true,\"data\":{\"ticks\":%lu}}",
            (unsigned long)ticks
        );
        return;
    }

    snprintf(response, max_resp,
        "{\"success\":false,\"error\":\"Unknown action '%s'\"}",
        action
    );
}

// Strong symbol overrides weak hook in ritawapp_modules.c
void register_custom_user_modules(void) {
    ritawapp_register_module("myModule", handle_my_custom_module);
}
```

### 6.3 Consuming in Vue 3
```typescript
import { myModule } from '../custom_module/my_module';

const { ticks } = await myModule.getSystemTicks();
console.log("Current Win32 system ticks:", ticks);
```

---

## 7. Frameless Windows & Draggable Titlebars

When `"frameless": true` is enabled in `RitaWapp.json`, the standard Windows window chrome is removed, allowing you to design bespoke desktop headers:

### Rules for Frameless Headers:
1. Add the CSS class `webui-drag` (or attribute `data-webui-drag`) to your header container.
2. Any interactive buttons, inputs, or links inside the header **must** have the class `webui-no-drag` to ensure click and selection events are received.

```html
<header class="webui-drag flex items-center h-10 px-4 bg-slate-900 text-white select-none">
  <div class="flex items-center space-x-2">
    <img src="/app.ico" class="w-4 h-4" />
    <span class="text-sm font-medium">My Custom Titlebar</span>
  </div>

  <!-- Window Controls -->
  <div class="webui-no-drag ml-auto flex items-center space-x-1">
    <button @click="window.appWindow.minimize()" class="px-3 py-1 hover:bg-slate-800">_</button>
    <button @click="window.appWindow.maximize()" class="px-3 py-1 hover:bg-slate-800">□</button>
    <button @click="window.appWindow.close()" class="px-3 py-1 hover:bg-red-600">✕</button>
  </div>
</header>
```

---

## 8. Security, Cryptography & Production Packaging

RitaWapp is built with zero-trust source protection:

1. **Encrypted Bundle Container (`Rita.W.app`)**:
   During `rwa build`, all HTML, CSS, JavaScript, and static assets are bundled and encrypted using **AES-256-GCM** authenticated encryption with a unique 256-bit key generated in `RitaWapp.json`.
2. **In-Memory Decryption**:
   At application startup, the native C executable decrypts the bundle strictly into RAM using Windows hardware-accelerated **BCrypt** primitives. Plaintext is **never** written to temporary files or disk.
3. **RAM Wipe on Teardown**:
   When the window is closed, memory buffers containing plaintext code and keys are immediately wiped with `SecureZeroMemory()`.
4. **Stripped Production Binary**:
   Production executables are compiled with `-Os`, stripped of debug symbols, and have DevTools keyboard accelerators disabled.
5. **PE Resource Icon Embedding**:
   `windres` automatically embeds your application's `app.ico` into the executable resource section, so Windows Explorer displays your high-resolution icon natively.
6. **Zero Development Residue**:
   In production builds, no `.rwa` directory or `webui_port` file is created. All internal SQLite temporary caches use the Windows `%TEMP%` folder, and upon application exit, a full `SQLITE_CHECKPOINT_TRUNCATE` commits all data and unlinks temporary `-wal` and `-shm` files, leaving only `database.db` alongside your executable.

---

## 9. Troubleshooting & FAQ

### Q: Why does `rwa dev` show a blank screen?
- Ensure the dev server port `5173` is not blocked by a local firewall.
- Check `.rwa/runtime.log` inside your project for detailed startup diagnostic traces.

### Q: How do I open DevTools in development?
- Press **F12** or **Ctrl+Shift+I**, or call `window.appWindow.openDevTools()` in your code.

### Q: Can I use npm packages?
- RitaWapp is strictly **Deno-only**. You can import any modern ES module from JSR, Deno Land (`https://deno.land/`), or ESM CDNs (`esm.sh`). Node.js and `npm install` are intentionally unsupported to guarantee reproducible, lightweight builds.

### Q: Where is the SQLite database file stored?
- In `dist/bin/database.db` alongside your compiled executable. In dev mode, it is created in the current working directory.
