# RitaWapp AI Agent Knowledge Base & Coding Dataset

This file is the primary context and specification dataset for any AI coding assistant (Cursor, Claude, Antigravity, Copilot, ChatGPT) working on this RitaWapp application.

---

## 1. System Architecture & Foundation

RitaWapp is an ultra-lightweight, high-performance desktop framework for Windows (x64) combining:
1. **Native C11 Runtime Core**: Win32, Winsock2, Windows BCrypt, DWM composition, and WebUI v2 IPC.
2. **Microsoft Edge WebView2**: Evergreen Chromium engine (frameless, hardware-accelerated, transparent, zero-flash).
3. **Web Frontend**: Vue 3 + TypeScript SPA, rendered at 60/120fps with native OS integration.
4. **Security & Obfuscation**: Frontend bundle is encrypted in `dist/bin/Rita.W.app` via AES-256-GCM and decrypted strictly in RAM via Windows BCrypt API.
5. **Toolchain**: Strictly powered by **Deno** and the global `rwa` CLI. **Node.js, npm, package.json, and node_modules are strictly forbidden.**

---

## 2. Command Table

All project operations are performed via the global `rwa` command:

| Command | Action | Description |
|---|---|---|
| `rwa dev` | Start Development Mode | Starts the Deno dev server on `http://127.0.0.1:5173` with WebSocket hot-reloading (`/rwa-live-reload`) and launches the native runtime with DevTools enabled (`F12` / `Ctrl+Shift+I`). |
| `rwa build` | Production Build | Encrypts `dist/index.html` into `dist/bin/Rita.W.app` (AES-256-GCM), compiles the native C runtime via MinGW GCC, embeds Windows PE icon resource, and outputs the standalone executable `dist/bin/<AppName>.exe`. |
| `rwa run` | Run Standalone Binary | Launches the compiled production executable from `dist/bin/`. |
| `rwa doctor` | Diagnostics Preflight | Verifies Deno, GCC, WebView2 runtime, and strict toolchain purity. |

---

## 3. Project Structure

```text
<AppName>/
├── dist/
│   ├── bin/                    # Production output (created on `rwa build`)
│   │   ├── <AppName>.exe       # Standalone native Windows executable
│   │   ├── Rita.W.app          # Encrypted AES-256-GCM frontend container
│   │   ├── app.ico             # Application icon
│   │   └── database.db         # Embedded SQLite database (WAL mode)
│   ├── index.html              # Frontend entry point
│   ├── index-[hash].js         # Vue 3 application logic & components
│   └── style-[hash].css        # Tailored styling & window themes
├── src/                        # Vue 3 source files (for development & editing)
│   ├── App.vue                 # Root desktop UI component
│   ├── main.ts                 # Vue 3 bootstrapping
│   ├── ritawapp.d.ts           # Global TypeScript definitions
│   └── ritawapp.modules.ts     # Type-safe module wrappers
├── app.ico                     # Application icon (embedded into .exe by windres)
├── RitaWapp.json               # Application configuration
├── Agent.md                    # This AI Agent dataset
└── Doc.md                      # Developer documentation
```

---

## 4. Native RPC Bridge & IPC Specification

Frontend communicates with the native C11 runtime using the WebUI IPC bridge.

### Low-level Bridge Call
```typescript
declare global {
  interface Window {
    rita_module_call: (payload: string) => Promise<string>;
    rita_bridge_call: (payload: string) => Promise<string>;
    __RWA_ENABLED_MODULES__?: Record<string, boolean>;
  }
}

// Low-level invocation format:
const responseRaw = await window.rita_module_call(JSON.stringify({
  module: "os",
  action: "getMemory",
  args: []
}));
const result = JSON.parse(responseRaw);
// Returns: { success: boolean, data?: any, error?: string }
```

### High-level Window Bindings
For convenience, enabled modules are bound directly to `window.<module>`:
- `window.appWindow`
- `window.database`
- `window.mongooseSqlite` (or `mongoose` ODM)
- `window.fs`
- `window.os`
- `window.shell`
- `window.process`
- `window.network`
- `window.update`
- `window.cloudSync`
- `window.tray`
- `window.net`
- `window.dgram`
- `window.http`
- `window.fetch`
- `window.express`
- `window.ws`
- `window.admZip`
- `window.path`

---

## 5. Complete 19 Integrated Native Modules API Dataset

### 1. `appWindow` (Window Management & DevTools)
- `close(): Promise<void>`: Closes the application.
- `minimize(): Promise<void>`: Minimizes window to taskbar.
- `maximize(): Promise<void>`: Toggles maximize/restore state.
- `restore(): Promise<void>`: Restores from maximized/minimized state.
- `isMaximized(): Promise<boolean>`: Returns true if currently maximized.
- `setTitle(title: string): Promise<boolean>`: Updates window title dynamically.
- `setSize(width: number, height: number): Promise<boolean>`: Resizes window.
- `getSize(): Promise<{ width: number, height: number }>`: Gets current dimensions.
- `setPosition(x: number, y: number): Promise<boolean>`: Moves window on screen.
- `getPosition(): Promise<{ x: number, y: number }>`: Gets screen coordinates.
- `setFrameless(frameless: boolean): Promise<boolean>`: Toggles Win32 frameless mode.
- `setTransparent(transparent: boolean): Promise<boolean>`: Toggles alpha transparency.
- `center(): Promise<boolean>`: Centers window on primary monitor.
- `openDevTools(): Promise<boolean>`: Opens Chromium DevTools inspector.

### 2. `os` (Operating System & Hardware Fingerprint)
- `getPlatform(): Promise<string>`: Returns OS platform (e.g., `"win32"`).
- `getArch(): Promise<string>`: Returns architecture (e.g., `"x64"`).
- `getHostname(): Promise<string>`: Returns computer network name.
- `getCpus(): Promise<{ model: string, cores: number }>`: Logical CPU cores and specs.
- `getUptime(): Promise<number>`: System uptime in seconds.
- `getMemory(): Promise<{ total: number, free: number, used: number }>`: RAM stats in bytes.
- `getHomeDir(): Promise<string>`: User home directory path (`C:\Users\<User>`).
- `getHardwareFingerprint(): Promise<{ cpuId: string, hardDriveId: string, motherboardId: string, fingerprint: string }>`: Unique SHA-256 machine signature.

### 3. `fs` (Fast Native File System)
- `readFile(path: string): Promise<string>`: Reads text file.
- `writeFile(path: string, content: string): Promise<boolean>`: Writes text file.
- `exists(path: string): Promise<boolean>`: Checks if file or directory exists.
- `readDir(path: string): Promise<string[]>`: Lists directory entries.
- `remove(path: string): Promise<boolean>`: Deletes file or directory.
- `copy(src: string, dest: string): Promise<boolean>`: Copies file.
- `mkdir(path: string): Promise<boolean>`: Recursively creates directories.
- `stat(path: string): Promise<{ size: number, isDirectory: boolean, modified: number }>`: File metadata.

### 4. `shell` (Command Execution & Desktop Shell)
- `execute(command: string): Promise<{ exitCode: number, stdout: string, stderr: string }>`: Executes system command.
- `openExternal(urlOrPath: string): Promise<boolean>`: Opens URL or file in default Windows handler.

### 5. `process` (Process Information & Control)
- `getPid(): Promise<number>`: Current process ID.
- `getMemoryUsage(): Promise<{ workingSet: number, privateBytes: number }>`: Process RAM footprint.
- `getEnv(name: string): Promise<string>`: Reads environment variable.
- `kill(pid: number): Promise<boolean>`: Terminates a process.

### 6. `database` (Embedded SQLite 3 with WAL Mode)
- `query(sql: string, params?: any[]): Promise<any[]>`: Executes SELECT query and returns rows.
- `execute(sql: string, params?: any[]): Promise<{ changes: number, lastInsertRowid: number }>`: Executes INSERT, UPDATE, DELETE.
- `transaction(statements: { sql: string, params?: any[] }[]): Promise<boolean>`: Atomic transactional batch execution.
- `getStats(): Promise<{ path: string, walMode: boolean, pageCount: number, pageSize: number }>`: Database stats.

### 7. `network` (Network Interfaces & Diagnostics)
- `getInterfaces(): Promise<Array<{ name: string, ip: string, mac: string, isUp: boolean }>>`: Network adapters.
- `ping(host: string): Promise<{ success: boolean, timeMs: number }>`: ICMP ping probe.
- `resolveDns(hostname: string): Promise<string[]>`: Resolves DNS hostname to IPs.

### 8. `tray` (Windows System Tray)
- `create(tooltip: string, iconPath?: string): Promise<boolean>`: Creates system tray icon.
- `destroy(): Promise<boolean>`: Removes tray icon.
- `setTooltip(tooltip: string): Promise<boolean>`: Updates tooltip text.
- `setIcon(iconPath: string): Promise<boolean>`: Updates tray icon.
- `hideToTray(hide: boolean): Promise<boolean>`: Minimizes window to tray.

### 9. `update` (In-App Binary Updater)
- `checkForUpdates(manifestUrl: string): Promise<{ hasUpdate: boolean, version: string, url: string }>`: Checks remote release.
- `downloadUpdate(url: string, destPath: string): Promise<boolean>`: Downloads payload.
- `applyUpdate(updateExe: string): Promise<boolean>`: Replaces executable and restarts.

### 10. `cloudSync` (Encrypted Cloud Synchronizer)
- `setSyncEndpoint(url: string, apiKey: string): Promise<boolean>`: Sets sync server.
- `pushSync(data: any): Promise<boolean>`: Pushes encrypted state to cloud.
- `pullSync(): Promise<any>`: Fetches latest cloud state.
- `getSyncStatus(): Promise<{ inSync: boolean, lastSyncTimestamp: number }>`: Status.

### 11. `net` (Low-level TCP Sockets via Mongoose)
- `createConnection(host: string, port: number): Promise<{ connId: string }>`: Connects TCP socket.
- `send(connId: string, data: string): Promise<boolean>`: Sends TCP data.
- `close(connId: string): Promise<boolean>`: Closes socket.

### 12. `dgram` (UDP Datagram Sockets)
- `createSocket(port?: number): Promise<{ socketId: string }>`: Creates UDP socket.
- `send(socketId: string, host: string, port: number, data: string): Promise<boolean>`: Sends UDP packet.
- `close(socketId: string): Promise<boolean>`: Closes UDP socket.

### 13. `http` (Embedded Micro HTTP Server)
- `createServer(port: number): Promise<{ serverId: string, port: number }>`: Starts background HTTP server.
- `request(options: { url: string, method?: string, headers?: Record<string, string>, body?: string }): Promise<{ status: number, body: string }>`: Native HTTP request.
- `close(serverId: string): Promise<boolean>`: Stops HTTP server.

### 14. `fetch` (Standard HTTP Fetch Client)
- `request(url: string, options?: any): Promise<{ ok: boolean, status: number, data: any }>`: Portable fetch implementation.

### 15. `express` (Express-like Lightweight Routing)
- `createServer(port: number): Promise<{ serverId: string }>`: Creates express route handler.
- `route(serverId: string, path: string, method: string, response: string): Promise<boolean>`: Registers mock/dynamic endpoint.
- `listen(serverId: string): Promise<boolean>`: Activates routing table.

### 16. `ws` (WebSocket Client & Server)
- `createServer(port: number): Promise<{ wsServerId: string }>`: Starts WebSocket server.
- `createClient(url: string): Promise<{ wsClientId: string }>`: Connects WebSocket client.
- `send(id: string, message: string): Promise<boolean>`: Dispatches WebSocket message.
- `close(id: string): Promise<boolean>`: Closes WebSocket connection.

### 17. `admZip` (Native Zip Archive Handling)
- `extract(zipPath: string, destDir: string): Promise<boolean>`: Unzips archive.
- `compress(sourceDir: string, zipPath: string): Promise<boolean>`: Compresses directory into .zip.

### 18. `path` (Cross-Platform Path Helpers)
- `join(...segments: string[]): string`: Joins path segments.
- `resolve(...segments: string[]): string`: Resolves absolute path.
- `basename(p: string, ext?: string): string`: Filename extraction.
- `dirname(p: string): string`: Directory portion.
- `extname(p: string): string`: Extension extraction.
- `isAbsolute(p: string): boolean`: Checks if path is absolute.

### 19. `mongoose-sqlite` (Mongoose ODM for Embedded SQLite JSON)
Full MongoDB/Mongoose API fidelity over embedded SQLite JSON documents:
- `Schema(definition, options)`: Schemas with types (`String`, `Number`, `Boolean`, `Date`, `Array`, `Object`, `ObjectId`), `required`, `default`, `unique`, `min`, `max`, `enum`, custom validators, and virtuals.
- `model(name, schema)`: Register model with full CRUD.
- **Query Builder**: `find()`, `findOne()`, `findById()`, `findByIdAndUpdate()`, `findByIdAndDelete()`, `countDocuments()`, `where()`, `equals()`, `gt()`, `gte()`, `lt()`, `lte()`, `in()`, `regex()`, `sort()`, `skip()`, `limit()`, `select()`, `exec()`.
- **Active Record Document**: `.save()`, `.remove()`, `.isModified()`, `.toObject()`, `.toJSON()`.
- **Middleware**: `.pre('save')`, `.pre('remove')`, `.post('save')`, `.post('remove')`.
- **Pagination & Streaming**: `.paginate({ page, limit, sort })`, `.stream()`.
- **Zero Configuration**: Automatically creates SQLite table `rwa_mongoose_<collection>` with indexed JSON fields.
- **Clean Temp Isolation**: Temporary tables and spill memory write to Windows `%TEMP%`. On app exit, WAL pages are flushed and all `-wal`/`-shm` temp files are cleaned up.

---

## 6. Window Dragging & Frameless Styling Rules

When building frameless window interfaces:
1. **Window Dragging**: Apply the class `webui-drag` (or attribute `data-webui-drag`) to any header element that should allow moving the window:
   ```html
   <header class="webui-drag" style="height: 36px; display: flex; align-items: center;">
     <span>My App Title</span>
     <!-- Non-draggable controls inside header MUST have class webui-no-drag -->
     <div class="webui-no-drag" style="margin-left: auto;">
       <button @click="minimizeWindow">_</button>
       <button @click="maximizeWindow">□</button>
       <button @click="closeWindow">✕</button>
     </div>
   </header>
   ```
2. **Window Controls Action**:
   ```typescript
   const minimizeWindow = () => window.appWindow.minimize();
   const maximizeWindow = () => window.appWindow.maximize();
   const closeWindow = () => window.appWindow.close();
   ```

---

## 7. Rules for AI Coding Agents

1. **Strictly Deno Only**: Never run `npm install`, never create `package.json`. Use `rwa dev` and `rwa build`.
2. **Zero-Import Architecture**: Never write `import { fs, os, shell, ... } from "./RitaWapp"`. With `createApp(App).use(RitaWapp)`, every native module and constructor is globally accessible (`fs`, `os`, `shell`, `webUI`, `mongoose`, `Schema`, `db`, etc.) and typed in `ritawapp.d.ts`.
3. **Mongoose Auto-Save**: Mongoose documents are reactive and automatically persist changes to SQLite in the background (e.g. `user.age = 30`). Never force `await doc.save()` on every property modification unless an immediate flush is specifically required.
4. **Check Enabled Modules**: Always inspect `window.__RWA_ENABLED_MODULES__` before calling a module if selective compilation is used in `RitaWapp.json`.
5. **Handle Async RPC**: Every native call across the WebUI bridge is asynchronous and returns a Promise.
6. **Preserve Purity**: Keep root files clean and maintain the encrypted container pipeline intact.
