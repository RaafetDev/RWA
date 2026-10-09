# RitaWapp Master Developer Documentation & API Reference (Vanilla JS)

Welcome to the definitive developer guide for **RitaWapp**, the high-performance desktop framework for Windows 7–11 (x64) combining a native C11 runtime, Microsoft Edge WebView2, and pure Vanilla JavaScript (zero bundler, zero build step required).

---

## Table of Contents

1. [Architecture & Execution Model](#1-architecture--execution-model)
2. [Quick Start & CLI Toolchain](#2-quick-start--cli-toolchain)
3. [Project Configuration (`RitaWapp.json`)](#3-project-configuration-ritawappjson)
4. [The RitaWapp RPC Bridge (`src/rpc.js`)](#4-the-ritawapp-rpc-bridge-srcrpcjs)
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

RitaWapp pairs a lean, hardware-accelerated Win32 C11 engine with Microsoft Edge WebView2 Evergreen runtime.

- **Zero Bundler Required**: In the Vanilla JS template, edit `index.html` and `src/main.js` directly with standard ES2022 JavaScript.
- **In-Memory Asset Decryption**: In production builds (`rwa build`), your HTML, CSS, and JS files are packed into an encrypted container `dist/bin/Rita.W.app` (AES-256-GCM) and decrypted strictly in RAM via Windows BCrypt primitives.
- **RAM Wipe on Exit**: Crypto keys and plaintext buffers are zeroized with `SecureZeroMemory()` when the app exits.

---

## 2. Quick Start & CLI Toolchain

All lifecycle commands are managed via the global `rwa` tool:

### 2.1 Development Mode (`rwa dev`)
```powershell
rwa dev
```
- Starts live-reloading dev server at `http://127.0.0.1:5173`.
- Launches the native Windows executable connected directly to the dev server.
- Press **F12** or **Ctrl+Shift+I** anytime to toggle the Chromium DevTools inspector.
- Edits to `index.html`, `src/main.js`, or CSS files reload instantly.

### 2.2 Production Build (`rwa build`)
```powershell
rwa build
```
- Encrypts your frontend code into `dist/bin/Rita.W.app` using **AES-256-GCM**.
- Compiles the standalone executable `dist/bin/<AppName>.exe` with MinGW-w64 GCC (`-Os` size optimization).
- Embeds `app.ico` into the Windows PE resource table via `windres`.

### 2.3 Running Standalone Release (`rwa run`)
```powershell
rwa run
```
Or directly double-click `dist/bin/<AppName>.exe`.

---

## 3. Project Configuration (`RitaWapp.json`)

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
    "frameless": false,
    "transparent": false,
    "center": true
  },
  "tray": {
    "enable": false,
    "tooltip": "My Application Desktop",
    "icon": "app.ico",
    "hideToTrayOnMinimize": false
  },
  "modules": "all",
  "assetsMod": false,
  "security": {
    "aesKey": "<64-character-hex-aes-256-key>",
    "cipher": "AES-256-GCM"
  },
  "compiler": {
    "appBrowserMode": "webview2AutoInstall",
    "gccPath": "gcc",
    "optimization": "-Os"
  }
}
```

---

## 4. The RitaWapp RPC Bridge (`src/rpc.js`)

In Vanilla JS, `src/rpc.js` exports a clean async wrapper `ritaRpc(module, action, ...args)`:

```javascript
import { ritaRpc } from './src/rpc.js';

// Invoking native modules
const memory = await ritaRpc('os', 'getMemory');
console.log('Total RAM:', memory.total);
```

You can also call the low-level bridge directly:
```javascript
const raw = await window.rita_module_call(JSON.stringify({
  module: "os",
  action: "getMemory",
  args: []
}));
const res = JSON.parse(raw);
```

---

## 5. Complete API Reference (All 18 Native Modules)

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

#### Vanilla JS Example:
```javascript
import { ritaRpc } from './src/rpc.js';

document.getElementById('btn-min').onclick = () => ritaRpc('appWindow', 'minimize');
document.getElementById('btn-max').onclick = () => ritaRpc('appWindow', 'maximize');
document.getElementById('btn-close').onclick = () => ritaRpc('appWindow', 'close');
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

#### Vanilla JS Example:
```javascript
const mem = await ritaRpc('os', 'getMemory');
document.getElementById('ram-info').textContent = `${(mem.used / 1e9).toFixed(1)} GB used`;

const hw = await ritaRpc('os', 'getHardwareFingerprint');
console.log('Unique Machine Signature:', hw.fingerprint);
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

#### Vanilla JS Example:
```javascript
const filePath = 'C:\\MyApp\\data.txt';
await ritaRpc('fs', 'writeFile', filePath, 'Hello from Vanilla JS!');
const text = await ritaRpc('fs', 'readFile', filePath);
console.log('File content:', text);
```

---

### 5.4 `shell`
Launches native Windows commands and integrates with the Windows shell.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `execute(command)` | `command: string` | `Promise<{ exitCode: number, stdout: string, stderr: string }>` | Executes command synchronously via `cmd.exe /c`. |
| `openExternal(target)` | `target: string` | `Promise<boolean>` | Opens URL, file, or protocol in default Windows application. |

#### Vanilla JS Example:
```javascript
const result = await ritaRpc('shell', 'execute', 'whoami');
console.log('Current user:', result.stdout.trim());

// Open external browser
await ritaRpc('shell', 'openExternal', 'https://github.com');
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

---

### 5.6 `database`
Embedded SQLite 3 engine operating in Write-Ahead Logging (WAL) mode (`database.db`).

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `query(sql, params)` | `sql: string, params?: any[]` | `Promise<any[]>` | Executes a SELECT statement with prepared parameters. |
| `execute(sql, params)` | `sql: string, params?: any[]` | `Promise<{ changes: number, lastInsertRowid: number }>` | Executes INSERT, UPDATE, DELETE statements. |
| `transaction(stmts)` | `stmts: { sql: string, params?: any[] }[]` | `Promise<boolean>` | Executes a series of statements inside an atomic transaction. |
| `getStats()` | None | `Promise<{ path: string, walMode: boolean, pageCount: number, pageSize: number }>` | Database storage metrics and WAL status. |

#### Vanilla JS Example:
```javascript
// Create table
await ritaRpc('database', 'execute', `
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
`);

#### Clean Temporary Lifecycle:
- **Temporary Storage**: All internal SQLite sorting, spill caches, and temporary tables are automatically directed to the Windows `%TEMP%` directory (`GetTempPathA()`).
- **WAL Auto-Checkpoint**: On application shutdown, a full `SQLITE_CHECKPOINT_TRUNCATE` is executed. All WAL pages are folded into `database.db`, and temporary `-wal` and `-shm` files are removed automatically.

---

### 5.7 `mongoose-sqlite` (Node.js Mongoose ODM Port)
Document-based Mongoose ODM operations backed by SQLite JSON tables.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `find` | `(collection, filter)` | `Promise<any[]>` | Queries matching documents. |
| `findOne` | `(collection, filter)` | `Promise<any \| null>` | Finds first matching document. |
| `create` | `(collection, doc)` | `Promise<any>` | Inserts document with generated `_id`. |
| `updateOne` | `(collection, filter, update)` | `Promise<any>` | Updates matching document. |
| `deleteOne` | `(collection, filter)` | `Promise<any>` | Removes matching document. |
| `countDocuments` | `(collection, filter)` | `Promise<number>` | Counts matching documents. |

#### Vanilla JS Example:
```javascript
// Insert document
const user = await ritaRpc('mongoose-sqlite', 'create', 'users', {
  name: 'Alex Mercer',
  role: 'developer',
  active: true
});
console.log('Created user:', user);

// Find documents
const activeUsers = await ritaRpc('mongoose-sqlite', 'find', 'users', { active: true });
console.log('Active users:', activeUsers);
```

---

### 5.8 `network`
Network adapter discovery, ICMP ping probes, and DNS resolution.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `getInterfaces()` | None | `Promise<Array<{ name: string, ip: string, mac: string, isUp: boolean }>>` | Enumerates local network adapters. |
| `ping(host)` | `host: string` | `Promise<{ success: boolean, timeMs: number }>` | Probes host connectivity and latency. |
| `resolveDns(hostname)`| `hostname: string` | `Promise<string[]>` | Resolves DNS hostname into IPv4/IPv6 addresses. |

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

---

### 5.9 `update`
In-app binary update management and self-replacement.

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `checkForUpdates(url)` | `url: string` | `Promise<{ hasUpdate: boolean, version: string, url: string }>` | Fetches update manifest. |
| `downloadUpdate(url, dest)` | `url: string, dest: string` | `Promise<boolean>` | Downloads binary package. |
| `applyUpdate(updateExe)` | `updateExe: string` | `Promise<boolean>` | Replaces current binary and restarts. |

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

Place custom C code inside `custom_module/`:
- `my_module.c`: Contains native C logic and `register_custom_user_modules(void)`.
- `my_module.h`: Header prototypes.
- `my_module.js`: JavaScript wrapper exporting helper functions.

The compiler automatically detects and compiles `custom_module/*.c` into your executable!

### Example in `src/main.js`:
```javascript
import { myModule } from '../custom_module/my_module.js';

const res = await myModule.hello();
console.log(res.message);
```

---

## 7. Frameless Windows & Draggable Titlebars

Add class `webui-drag` to any container element to make it draggable. Add class `webui-no-drag` to buttons or inputs inside it.

```html
<header class="webui-drag" style="display: flex; height: 36px; background: #222; color: #fff;">
  <span style="padding: 8px;">My Vanilla App</span>
  <div class="webui-no-drag" style="margin-left: auto;">
    <button onclick="ritaRpc('appWindow', 'minimize')">—</button>
    <button onclick="ritaRpc('appWindow', 'maximize')">□</button>
    <button onclick="ritaRpc('appWindow', 'close')">✕</button>
  </div>
</header>
```

---

## 8. Security, Cryptography & Production Packaging

1. **AES-256-GCM Container**: `rwa build` encrypts `index.html` into `dist/bin/Rita.W.app`.
2. **In-Memory Decryption**: Windows BCrypt decrypts strictly in RAM on startup.
3. **PE Icon**: `app.ico` is compiled into Windows PE resources with `windres`.
4. **Zero Development Residue**: In production builds, no `.rwa` directory or `webui_port` file is created. SQLite temporary structures use the Windows `%TEMP%` folder, and on exit, a full WAL checkpoint truncate deletes `-wal` and `-shm` temporary files.
5. **Distribution**: Share the `dist/bin/` folder or bundle it into an installer.
