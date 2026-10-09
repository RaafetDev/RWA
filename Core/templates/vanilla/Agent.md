# RitaWapp AI Agent Knowledge Base & Coding Dataset (Vanilla JS)

This file is the primary context and specification dataset for any AI coding assistant (Cursor, Claude, Antigravity, Copilot, ChatGPT) working on this Vanilla JavaScript RitaWapp application.

---

## 1. System Architecture & Foundation

RitaWapp is an ultra-lightweight, high-performance desktop framework for Windows (x64) combining:
1. **Native C11 Runtime Core**: Win32, Winsock2, Windows BCrypt, DWM composition, and WebUI v2 IPC.
2. **Microsoft Edge WebView2**: Evergreen Chromium engine (hardware-accelerated, transparent, zero-flash).
3. **Web Frontend**: Pure Vanilla JavaScript (ES2022) + HTML5 + CSS3 (zero bundler required, zero build step).
4. **Security & Obfuscation**: Frontend bundle is encrypted in `dist/bin/Rita.W.app` via AES-256-GCM and decrypted strictly in RAM via Windows BCrypt API.
5. **Toolchain**: Strictly powered by **Deno** and the global `rwa` CLI. **Node.js, npm, package.json, and node_modules are strictly forbidden.**

---

## 2. Command Table

All project operations are performed via the global `rwa` command:

| Command | Action | Description |
|---|---|---|
| `rwa dev` | Start Development Mode | Starts the Deno dev server on `http://127.0.0.1:5173` with WebSocket hot-reloading (`/rwa-live-reload`) and launches the native runtime with DevTools enabled (`F12` / `Ctrl+Shift+I`). |
| `rwa build` | Production Build | Encrypts `index.html` into `dist/bin/Rita.W.app` (AES-256-GCM), compiles the native C runtime via MinGW GCC, embeds Windows PE icon resource, and outputs the standalone executable `dist/bin/<AppName>.exe`. |
| `rwa run` | Run Standalone Binary | Launches the compiled production executable from `dist/bin/`. |
| `rwa doctor` | Diagnostics Preflight | Verifies Deno, GCC, WebView2 runtime, and strict toolchain purity. |

---

## 3. Project Structure

```text
<AppName>/
├── dist/
│   └── bin/                    # Production output (created on `rwa build`)
│       ├── <AppName>.exe       # Standalone native Windows executable
│       ├── Rita.W.app          # Encrypted AES-256-GCM frontend container
│       ├── app.ico             # Application icon
│       └── database.db         # Embedded SQLite database (WAL mode)
├── src/
│   ├── main.js                 # Application frontend logic
│   └── rpc.js                  # Native RPC bridge helper
├── index.html                  # Frontend entry point
├── app.ico                     # Application icon (embedded into .exe by windres)
├── RitaWapp.json               # Application configuration
├── Agent.md                    # This AI Agent dataset
└── Doc.md                      # Developer documentation
```

---

## 4. Native RPC Bridge & IPC Specification

Frontend communicates with the native C11 runtime using the WebUI IPC bridge.

### Low-level Bridge Call
```javascript
// Low-level invocation:
const responseRaw = await window.rita_module_call(JSON.stringify({
  module: "os",
  action: "getMemory",
  args: []
}));
const result = JSON.parse(responseRaw);
// Returns: { success: boolean, data?: any, error?: string }
```

### High-level Window Helper (`src/rpc.js`)
```javascript
import { ritaRpc } from './src/rpc.js';

// Clean async call to any module:
const memory = await ritaRpc('os', 'getMemory');
console.log('Total memory:', memory.total);
```

---

## 5. Complete 19 Integrated Native Modules API Dataset

### 1. `appWindow`
- `close()`: Closes the application.
- `minimize()`: Minimizes window to taskbar.
- `maximize()`: Toggles maximize/restore state.
- `restore()`: Restores from maximized/minimized state.
- `isMaximized()`: Returns true if currently maximized.
- `setTitle(title)`: Updates window title dynamically.
- `setSize(width, height)`: Resizes window.
- `getSize()`: Gets current dimensions.
- `setPosition(x, y)`: Moves window on screen.
- `getPosition()`: Gets screen coordinates.
- `setFrameless(frameless)`: Toggles Win32 frameless mode.
- `setTransparent(transparent)`: Toggles alpha transparency.
- `center()`: Centers window on primary monitor.
- `openDevTools()`: Opens Chromium DevTools inspector.

### 2. `os`
- `getPlatform()`: Returns `"win32"`.
- `getArch()`: Returns `"x64"`.
- `getHostname()`: Returns computer network name.
- `getCpus()`: Logical CPU cores and specs.
- `getUptime()`: System uptime in seconds.
- `getMemory()`: RAM stats `{ total, free, used }` in bytes.
- `getHomeDir()`: User home directory path.
- `getHardwareFingerprint()`: `{ cpuId, hardDriveId, motherboardId, fingerprint }`.

### 3. `fs`
- `readFile(path)`: Reads text file.
- `writeFile(path, content)`: Writes text file.
- `exists(path)`: Checks if file or directory exists.
- `readDir(path)`: Lists directory entries.
- `remove(path)`: Deletes file or directory.
- `copy(src, dest)`: Copies file.
- `mkdir(path)`: Recursively creates directories.
- `stat(path)`: File metadata `{ size, isDirectory, modified }`.

### 4. `shell`
- `execute(command)`: `{ exitCode, stdout, stderr }`.
- `openExternal(urlOrPath)`: Opens URL or file in default Windows handler.

### 5. `process`
- `getPid()`: Current process ID.
- `getMemoryUsage()`: `{ workingSet, privateBytes }`.
- `getEnv(name)`: Reads environment variable.
- `kill(pid)`: Terminates a process.

### 6. `database` (Embedded SQLite 3 WAL Mode)
- `query(sql, params)`: Executes SELECT query and returns rows array.
- `execute(sql, params)`: Executes INSERT, UPDATE, DELETE -> `{ changes, lastInsertRowid }`.
- `transaction(statements)`: Atomic transactional batch execution.
- `getStats()`: Database stats `{ path, walMode, pageCount, pageSize }`.

### 7. `network`
- `getInterfaces()`: Network adapters list.
- `ping(host)`: ICMP ping probe -> `{ success, timeMs }`.
- `resolveDns(hostname)`: Resolves DNS hostname to IPs.

### 8. `tray`
- `create(tooltip, iconPath)`: Creates system tray icon.
- `destroy()`: Removes tray icon.
- `setTooltip(tooltip)`: Updates tooltip text.
- `setIcon(iconPath)`: Updates tray icon.
- `hideToTray(hide)`: Minimizes window to tray.

### 9. `update`
- `checkForUpdates(manifestUrl)`: Checks remote release.
- `downloadUpdate(url, destPath)`: Downloads payload.
- `applyUpdate(updateExe)`: Replaces executable and restarts.

### 10. `cloudSync`
- `setSyncEndpoint(url, apiKey)`: Sets sync server.
- `pushSync(data)`: Pushes encrypted state to cloud.
- `pullSync()`: Fetches latest cloud state.
- `getSyncStatus()`: `{ inSync, lastSyncTimestamp }`.

### 11. `net`
- `createConnection(host, port)`: Connects TCP socket.
- `send(connId, data)`: Sends TCP data.
- `close(connId)`: Closes socket.

### 12. `dgram`
- `createSocket(port)`: Creates UDP socket.
- `send(socketId, host, port, data)`: Sends UDP packet.
- `close(socketId)`: Closes UDP socket.

### 13. `http`
- `createServer(port)`: Starts background HTTP server.
- `request({ url, method, headers, body })`: Native HTTP request.
- `close(serverId)`: Stops HTTP server.

### 14. `fetch`
- `request(url, options)`: Native fetch request.

### 15. `express`
- `createServer(port)`: Creates express server.
- `route(serverId, path, method, response)`: Registers endpoint.
- `listen(serverId)`: Activates routing table.

### 16. `ws`
- `createServer(port)`: Starts WebSocket server.
- `createClient(url)`: Connects WebSocket client.
- `send(id, message)`: Dispatches WebSocket message.
- `close(id)`: Closes connection.

### 17. `admZip`
- `extract(zipPath, destDir)`: Unzips archive.
- `compress(sourceDir, zipPath)`: Compresses directory into .zip.

### 18. `path`
- `join(...segments)`: Joins path segments.
- `resolve(...segments)`: Resolves absolute path.
- `basename(p, ext)`: Filename extraction.
- `dirname(p)`: Directory portion.
- `extname(p)`: Extension extraction.
- `isAbsolute(p)`: Checks if path is absolute.

### 19. `mongoose-sqlite`
- `Schema(definition, options)`: Schemas with data types, validation, and defaults.
- `model(name, schema)`: Model registration with active record query builder.
- `find()`, `findOne()`, `findById()`, `findByIdAndUpdate()`, `findByIdAndDelete()`, `countDocuments()`.
- Active Record: `.save()`, `.remove()`, `.toObject()`, `.toJSON()`.
- Middleware: `.pre('save')`, `.post('save')`.
- Temp storage in `%TEMP%`, zero temporary journal files left behind after exit.

---

## 6. Window Dragging & Frameless Styling Rules

When `"frameless": true` is enabled in `RitaWapp.json`:
1. Use class `webui-drag` on any container that should move the window.
2. Use class `webui-no-drag` on interactive children (buttons, inputs, links).

```html
<div class="webui-drag titlebar">
  <span>Vanilla Desktop App</span>
  <div class="webui-no-drag window-actions">
    <button onclick="ritaRpc('appWindow', 'minimize')">—</button>
    <button onclick="ritaRpc('appWindow', 'maximize')">▢</button>
    <button onclick="ritaRpc('appWindow', 'close')">✕</button>
  </div>
</div>
```

---

## 7. Rules for AI Coding Agents

1. **Strictly Deno Only**: Never run `npm install`, never create `package.json`. Use `rwa dev` and `rwa build`.
2. **Vanilla Simplicity**: Keep code clean, modern ES2022 JavaScript without unnecessary compilation steps.
3. **Handle Async RPC**: Every native call across the WebUI bridge is asynchronous and returns a Promise.
