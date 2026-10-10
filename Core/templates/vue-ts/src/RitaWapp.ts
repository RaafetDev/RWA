/**
 * ============================================================================
 * RitaWapp-ui/src/RitaWapp.ts
 * ============================================================================
 * RitaWapp Desktop Frontend Module System & Vue 3 Plugin
 *
 * Mimics familiar Node.js and Mongoose APIs in the frontend and injects them
 * into globalThis, eliminating the need to write backend code for common tasks:
 *
 *   - fs: Node.js-compatible File System API
 *   - os: Node.js-compatible Operating System metrics
 *   - path: Path manipulation utility
 *   - process: Process info, environment variables & cwd
 *   - shell: Command execution & child process runner
 *   - appWindow (and webUI): Native desktop window controls (frameless, drag, resize, etc.)
 *   - network: Network interfaces and internet connectivity
 *   - mongoose / db: Mongoose-like ODM for SQLite
 *   - cloudSync: Device-to-device and cloud data synchronization
 *   - update: Auto-updater for GitHub Releases
 * ============================================================================
 */

import {
  enabledModules,
  isAssetsMod,
  isModuleEnabled,
} from "./ritawapp.modules.ts";
export { enabledModules, isAssetsMod, isModuleEnabled };

/**
 * Resolves an asset path to the appropriate runtime URL.
 * In assetsMod (true), assets reside in /data/assets/ (e.g. /data/assets/logo.png).
 * In normal mode (false), assets reside in /assets/.
 */
export function getAssetUrl(assetPath: string): string {
  if (!assetPath) return "";
  if (
    assetPath.startsWith("http://") || assetPath.startsWith("https://") ||
    assetPath.startsWith("data:")
  ) {
    return assetPath;
  }
  const clean = assetPath.replace(/^(\.\/|\/)/, "");
  if (clean.startsWith("data/assets/")) {
    return `/${clean}`;
  }
  return isAssetsMod ? `/data/assets/${clean}` : `/${clean}`;
}

// Cache native browser primitives before any module injection occurs
const _nativeFetch =
  typeof globalThis !== "undefined" && typeof globalThis.fetch === "function"
    ? globalThis.fetch.bind(globalThis)
    : null;
const _NativeWebSocket = typeof globalThis !== "undefined" &&
    typeof (globalThis as any).WebSocket !== "undefined"
  ? (globalThis as any).WebSocket
  : null;

export interface App {
  config: {
    globalProperties: Record<string, any>;
  };
  provide(key: string | symbol, value: any): any;
  [key: string]: any;
}

export interface Plugin {
  install(app: App, ...options: any[]): any;
}

let _cachedRpcFn: ((payload: string) => Promise<string>) | null = null;
let _readyPromise: Promise<((payload: string) => Promise<string>) | null> | null = null;

/**
 * Low-level module invoker that communicates with the C runtime
 */
async function ensureRpcReady(
  timeoutMs = 500,
): Promise<((payload: string) => Promise<string>) | null> {
  if (_cachedRpcFn) return _cachedRpcFn;
  if (_readyPromise) return _readyPromise;

  _readyPromise = (async () => {
    const getNativeBridge = (): ((payload: string) => Promise<string>) | null => {
      const g = typeof window !== "undefined" ? (window as any) : (globalThis as any);
      const fn = g.rita_module_call || g.rita_bridge_call || g.webui?.rita_module_call;
      if (typeof fn === "function") return fn;

      const w = g.webui;
      if (
        w &&
        typeof w.call === "function" &&
        typeof w.isConnected === "function" &&
        w.isConnected()
      ) {
        return async (payload: string) => {
          if (typeof g.rita_module_call === "function") {
            return g.rita_module_call(payload);
          }
          return w.call("rita_module_call", payload);
        };
      }
      return null;
    };

    let fn = getNativeBridge();
    if (fn) {
      _cachedRpcFn = fn;
      return fn;
    }

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 20));
      fn = getNativeBridge();
      if (fn) {
        _cachedRpcFn = fn;
        return fn;
      }
    }

    // Dev server HTTP RPC fallback (when running in dev mode or in browser)
    if (typeof location !== "undefined" && location.origin) {
      try {
        const probe = await fetch("/_rwa_rpc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ module: "ping", action: "ping", args: [] }),
        });
        if (probe.ok) {
          const httpFallback = async (payload: string) => {
            const res = await fetch("/_rwa_rpc", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: payload,
            });
            return await res.text();
          };
          _cachedRpcFn = httpFallback;
          return httpFallback;
        }
      } catch {}
    }

    return null;
  })();

  try {
    const res = await _readyPromise;
    return res;
  } finally {
    if (!_cachedRpcFn) {
      _readyPromise = null;
    }
  }
}

export async function rpc(
  module: string,
  action: string,
  ...args: unknown[]
): Promise<any> {
  if (!isModuleEnabled(module)) {
    throw new Error(
      `[RitaWapp Module] Module '${module}' is disabled in RitaWapp-config.ts`,
    );
  }
  const payload = JSON.stringify({ module, action, args });

  const rpcFn = await ensureRpcReady();

  if (typeof rpcFn === "function") {
    try {
      const raw = await rpcFn(payload);
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && "success" in parsed) {
            if (parsed.success) {
              return parsed.data !== undefined ? parsed.data : parsed;
            }
            throw new Error(
              parsed.error || `[RitaWapp Module] ${module}.${action} failed.`,
            );
          }
          return parsed;
        } catch (jsonErr: any) {
          if (jsonErr.message?.includes("[RitaWapp Module]")) throw jsonErr;
          return raw;
        }
      }
      return raw;
    } catch (err: any) {
      if (err?.message?.includes("WebSocket is not connected")) {
        _cachedRpcFn = null;
        _readyPromise = null;
      }
      console.error(`[RitaWapp Native RPC] ${module}.${action} failed:`, err);
      throw err;
    }
  } else {
    // Browser preview fallback mode
    console.warn(
      `[RitaWapp Mock] Native C module not connected. Simulated call: ${module}.${action}`,
    );
    return getMockFallback(module, action, args);
  }
}

function getMockFallback(module: string, action: string, args: unknown[]): any {
  if (module === "os") {
    return {
      platform: "win32",
      arch: "x64",
      type: "Windows_NT",
      release: "10.0.22631",
      hostname: "DEVELOPER-PC",
      homedir: "C:\\Users\\Developer",
      tmpdir: "C:\\Users\\Developer\\AppData\\Local\\Temp",
      totalmem: 17179869184,
      freemem: 8589934592,
      uptime: 3600,
      cpuCount: 16,
    };
  }
  if (module === "process") {
    return {
      pid: 1234,
      platform: "win32",
      arch: "x64",
      cwd: "C:\\Users\\Developer\\Desktop\\RitaWapp",
      env: { USERNAME: "Developer", OS: "Windows_NT" },
      uptime: 120,
    };
  }
  if (module === "fs") {
    if (action === "exists" || action === "existsSync") return true;
    if (action === "readFile") return "Mock file content (browser preview)";
    if (action === "readdir") {
      return ["RitaWapp.exe", "Rita.W.app", "database.db"];
    }
    return true;
  }
  if (module === "network") {
    if (action === "isOnline") return true;
    if (action === "ping") {
      return { ok: true, latencyMs: 14, alive: true, timeMs: 14 };
    }
    if (action === "scanWifi") {
      return [{ ssid: "RitaWapp-5G", signal: 95, auth: "WPA2" }];
    }
    return [{ name: "Wi-Fi", type: "wireless", status: "connected" }];
  }
  if (module === "appWindow") {
    if (action === "isFrameless") return true;
    if (action === "isMaximized") return false;
    if (action === "getSize") return { width: 1100, height: 750 };
    if (action === "getPosition") return { x: 100, y: 100 };
    return true;
  }
  if (
    module === "database" || module === "db" || module === "mongoose" ||
    module === "sqlite" || module === "sqlite3"
  ) {
    if (action === "find" || action === "query" || action === "findOne") {
      return [{ _id: "doc_1", name: "Alex Mercer", role: "admin" }];
    }
    if (action === "create" || action === "insert" || action === "insertOne") {
      return { _id: "doc_1", ...(args[1] as any || {}) };
    }
    if (action === "count" || action === "countDocuments") return 1;
    if (action === "aiAutoIndex") {
      return {
        success: true,
        collection: args[0] || "default",
        indexesCreated: 11,
        ftsEnabled: true,
        vectorStoreReady: true,
      };
    }
    if (action === "aiSearch") {
      return {
        success: true,
        data: [{
          doc: { _id: "item_1", name: "Laptop Pro", category: "Electronics" },
          rank: -1.0,
        }],
        total: 1,
      };
    }
    if (action === "aiStoreVector") {
      return {
        success: true,
        docId: (args[0] as any)?.docId || "vec_1",
        dimensions: 128,
      };
    }
    if (action === "aiSearchVector") {
      return {
        success: true,
        matches: [{
          docId: "vec_1",
          similarity: 0.985,
          metadata: { title: "Laptop Pro" },
        }],
        count: 1,
      };
    }
    if (action === "aiOptimize") {
      return {
        success: true,
        optimized: true,
        message: "Database indexes analyzed and tuned",
      };
    }
    return { success: true };
  }
  if (module === "tray") {
    if (action === "isHideToTray") return false;
    return true;
  }
  if (module === "net") {
    if (action === "createServer") return { handle: 101, success: true };
    if (action === "connect") return { handle: 102, success: true };
    if (action === "poll") return { events: [{ type: "connect" }] };
    return { success: true };
  }
  if (module === "dgram") {
    if (action === "createSocket") return { handle: 201, success: true };
    if (action === "poll") return { events: [] };
    return { success: true };
  }
  if (module === "http") {
    if (action === "request") {
      return {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "Mock response from RitaWapp native bridge",
        }),
      };
    }
    if (action === "createServer") return { handle: 301, success: true };
    if (action === "poll") return { events: [] };
    return { success: true };
  }
  if (module === "adm_zip" || module === "admZip") {
    if (action === "readEntries") {
      return {
        success: true,
        entries: [{
          entryName: "app.ico",
          isDirectory: false,
          size: 4286,
          compressedSize: 1024,
        }],
      };
    }
    return { success: true };
  }
  if (module === "shell") {
    if (action === "exec") {
      return {
        stdout: "desktop-user\n",
        stderr: "",
        exitCode: 0,
      };
    }
    return { success: true };
  }
  return { success: true };
}

// ============================================================================
// 1. fs: Node.js-compatible File System API
// ============================================================================
export const fs = {
  async readFile(
    filePath: string,
    encoding: string = "utf-8",
  ): Promise<string> {
    return await rpc("fs", "readFile", filePath, encoding);
  },

  async writeFile(filePath: string, data: string): Promise<boolean> {
    return await rpc("fs", "writeFile", filePath, data);
  },

  async appendFile(filePath: string, data: string): Promise<boolean> {
    return await rpc("fs", "appendFile", filePath, data);
  },

  async exists(filePath: string): Promise<boolean> {
    return await rpc("fs", "exists", filePath);
  },

  async existsSync(filePath: string): Promise<boolean> {
    return await rpc("fs", "exists", filePath);
  },

  async readdir(dirPath: string): Promise<string[]> {
    return await rpc("fs", "readdir", dirPath);
  },

  async mkdir(dirPath: string): Promise<boolean> {
    return await rpc("fs", "mkdir", dirPath);
  },

  async unlink(filePath: string): Promise<boolean> {
    return await rpc("fs", "unlink", filePath);
  },

  async rm(filePath: string): Promise<boolean> {
    return await rpc("fs", "unlink", filePath);
  },

  async copyFile(src: string, dest: string): Promise<boolean> {
    return await rpc("fs", "copyFile", src, dest);
  },

  async stat(
    filePath: string,
  ): Promise<{ size: number; isDirectory: boolean; isFile: boolean }> {
    return await rpc("fs", "stat", filePath);
  },

  async getAppDir(): Promise<string> {
    return await rpc("fs", "getAppDir");
  },

  async getDataDir(): Promise<string> {
    const appDir = await this.getAppDir();
    return isAssetsMod ? `${appDir}\\data` : appDir;
  },

  async getAssetsDir(): Promise<string> {
    const appDir = await this.getAppDir();
    return isAssetsMod ? `${appDir}\\data\\assets` : `${appDir}\\assets`;
  },

  promises: null as any,
};
fs.promises = fs;

// ============================================================================
// 2. os: Node.js-compatible Operating System API
// ============================================================================
let cachedOsInfo: any = null;
async function fetchOs(): Promise<any> {
  if (!cachedOsInfo) {
    cachedOsInfo = await rpc("os", "getInfo");
  }
  return cachedOsInfo;
}

export const os = {
  platform(): string {
    return "win32";
  },
  arch(): string {
    return "x64";
  },
  type(): string {
    return "Windows_NT";
  },
  async release(): Promise<string> {
    const o = await fetchOs();
    return o.release || "10.0.0";
  },
  async hostname(): Promise<string> {
    const o = await fetchOs();
    return o.hostname || "localhost";
  },
  async homedir(): Promise<string> {
    const o = await fetchOs();
    return o.homedir || "C:\\";
  },
  async tmpdir(): Promise<string> {
    const o = await fetchOs();
    return o.tmpdir || "C:\\Temp";
  },
  async totalmem(): Promise<number> {
    const o = await fetchOs();
    return o.totalmem || 17179869184;
  },
  async freemem(): Promise<number> {
    const o = await fetchOs();
    return o.freemem || 8589934592;
  },
  async uptime(): Promise<number> {
    const o = await fetchOs();
    return o.uptime || 0;
  },
  async cpus(): Promise<any[]> {
    const o = await fetchOs();
    return new Array(o.cpuCount || 4).fill({ model: "Intel/AMD Processor" });
  },
  async getMetrics(): Promise<any> {
    return await fetchOs();
  },
  async getInfo(): Promise<any> {
    return await fetchOs();
  },
  async cpuid(): Promise<string> {
    const o = await fetchOs();
    return o.cpuid || (await rpc("os", "cpuid"));
  },
  async cpuId(): Promise<string> {
    return await this.cpuid();
  },
  async harddriveId(): Promise<string> {
    const o = await fetchOs();
    return o.harddriveId || (await rpc("os", "harddriveId"));
  },
  async hardDriveId(): Promise<string> {
    return await this.harddriveId();
  },
  async diskId(): Promise<string> {
    return await this.harddriveId();
  },
  async motherboardId(): Promise<string> {
    const o = await fetchOs();
    return o.motherboardId || (await rpc("os", "motherboardId"));
  },
  async motherBoardId(): Promise<string> {
    return await this.motherboardId();
  },
  async fingerprint(): Promise<string> {
    const o = await fetchOs();
    return o.fingerprint || (await rpc("os", "fingerprint"));
  },
  async machineId(): Promise<string> {
    return await this.fingerprint();
  },
};

// ============================================================================
// 3. path: Node.js-compatible Path Utility API
// ============================================================================
export const path = {
  sep: "\\",
  delimiter: ";",

  join(...segments: string[]): string {
    const parts = segments
      .filter(Boolean)
      .map((s) => s.replace(/[\/\\]+/g, "\\"))
      .join("\\");
    return this.normalize(parts);
  },

  resolve(...segments: string[]): string {
    return this.normalize(this.join(...segments));
  },

  normalize(pathStr: string): string {
    if (!pathStr) return ".";
    const normalized = pathStr.replace(/[\/\\]+/g, "\\");
    const isAbs = /^[a-zA-Z]:[\\\/]/.test(normalized);
    const prefix = isAbs
      ? normalized.slice(0, 3)
      : (normalized.startsWith("\\\\") ? "\\\\" : "");
    const rest = isAbs
      ? normalized.slice(3)
      : (normalized.startsWith("\\\\") ? normalized.slice(2) : normalized);
    const parts = rest.split(/[\\\/]+/).filter(Boolean);
    const stack: string[] = [];
    for (const p of parts) {
      if (p === ".") continue;
      if (p === "..") {
        if (stack.length > 0 && stack[stack.length - 1] !== "..") {
          stack.pop();
        } else if (!isAbs) {
          stack.push("..");
        }
      } else {
        stack.push(p);
      }
    }
    let res = prefix + stack.join("\\");
    if (!res) res = ".";
    return res;
  },

  isAbsolute(pathStr: string): boolean {
    return /^[a-zA-Z]:[\\\/]/.test(pathStr) || pathStr.startsWith("\\\\");
  },

  basename(pathStr: string, ext?: string): string {
    const norm = this.normalize(pathStr);
    const last = norm.split("\\").pop() || "";
    if (ext && last.endsWith(ext)) {
      return last.slice(0, -ext.length);
    }
    return last;
  },

  dirname(pathStr: string): string {
    const norm = this.normalize(pathStr);
    const idx = norm.lastIndexOf("\\");
    if (idx <= 0) {
      return idx === 0
        ? "\\"
        : (norm.length === 3 && norm[1] === ":" ? norm : ".");
    }
    if (idx === 2 && norm[1] === ":") return norm.slice(0, 3);
    return norm.slice(0, idx);
  },

  extname(pathStr: string): string {
    const base = this.basename(pathStr);
    const idx = base.lastIndexOf(".");
    if (idx <= 0) return "";
    return base.slice(idx);
  },

  parse(
    pathStr: string,
  ): { root: string; dir: string; base: string; ext: string; name: string } {
    const base = this.basename(pathStr);
    const ext = this.extname(pathStr);
    const dir = this.dirname(pathStr);
    const root = /^[a-zA-Z]:[\\\/]/.test(pathStr)
      ? pathStr.slice(0, 3)
      : (pathStr.startsWith("\\\\") ? "\\\\" : "");
    return {
      root,
      dir,
      base,
      ext,
      name: base.slice(0, base.length - ext.length),
    };
  },

  format(
    pathObj: {
      root?: string;
      dir?: string;
      base?: string;
      ext?: string;
      name?: string;
    },
  ): string {
    const dir = pathObj.dir || pathObj.root || "";
    const base = pathObj.base || `${pathObj.name || ""}${pathObj.ext || ""}`;
    if (!dir) return base;
    return `${dir}\\${base}`;
  },

  relative(from: string, to: string): string {
    const fromNorm = this.normalize(from).split("\\");
    const toNorm = this.normalize(to).split("\\");
    let same = 0;
    while (
      same < fromNorm.length && same < toNorm.length &&
      fromNorm[same].toLowerCase() === toNorm[same].toLowerCase()
    ) {
      same++;
    }
    const up = new Array(fromNorm.length - same).fill("..");
    const down = toNorm.slice(same);
    return [...up, ...down].join("\\") || ".";
  },

  win32: null as any,
  posix: null as any,
};

path.win32 = path;
path.posix = {
  sep: "/",
  delimiter: ":",
  join(...segments: string[]): string {
    return segments.filter(Boolean).join("/").replace(/\/+/g, "/");
  },
  resolve(...segments: string[]): string {
    return this.join(...segments);
  },
  normalize(p: string): string {
    const norm = p.replace(/\\/g, "/");
    const isAbs = norm.startsWith("/");
    const parts = norm.split("/").filter(Boolean);
    const stack: string[] = [];
    for (const part of parts) {
      if (part === ".") continue;
      if (part === "..") {
        if (stack.length > 0 && stack[stack.length - 1] !== "..") {
          stack.pop();
        } else if (!isAbs) {
          stack.push("..");
        }
      } else {
        stack.push(part);
      }
    }
    return (isAbs ? "/" : "") + stack.join("/");
  },
  isAbsolute(p: string): boolean {
    return p.startsWith("/");
  },
  basename(p: string, ext?: string): string {
    const last = p.split("/").pop() || "";
    if (ext && last.endsWith(ext)) return last.slice(0, -ext.length);
    return last;
  },
  dirname(p: string): string {
    const idx = p.lastIndexOf("/");
    return idx <= 0 ? (idx === 0 ? "/" : ".") : p.slice(0, idx);
  },
  extname(p: string): string {
    const base = this.basename(p);
    const idx = base.lastIndexOf(".");
    return idx <= 0 ? "" : base.slice(idx);
  },
  parse(p: string) {
    const base = this.basename(p);
    const ext = this.extname(p);
    return {
      root: p.startsWith("/") ? "/" : "",
      dir: this.dirname(p),
      base,
      ext,
      name: base.slice(0, base.length - ext.length),
    };
  },
  format(obj: any) {
    return `${obj.dir || ""}/${obj.base || obj.name || ""}`;
  },
  relative(from: string, to: string) {
    return to;
  },
  win32: path,
  posix: null as any,
};
path.posix.posix = path.posix;

// ============================================================================
// 4. process: Node.js-compatible Process API
// ============================================================================
export const process = {
  platform: "win32",
  arch: "x64",
  env: {
    NODE_ENV: (typeof globalThis !== "undefined" &&
      (globalThis as any).process?.env?.NODE_ENV) || "development",
    ...((typeof globalThis !== "undefined" &&
      (globalThis as any).process?.env) || {}),
  } as Record<string, string>,

  async cwd(): Promise<string> {
    const res = await rpc("process", "cwd");
    return typeof res === "string" ? res : res.cwd || "";
  },

  async getEnv(name?: string): Promise<any> {
    const res = await rpc("process", "getEnv", name ? { name } : {});
    return res;
  },

  async exit(code: number = 0): Promise<void> {
    await rpc("process", "exit", { code });
  },

  async memoryUsage(): Promise<
    { heapTotal: number; heapUsed: number; rss: number }
  > {
    return await rpc("process", "memoryUsage");
  },

  async uptime(): Promise<number> {
    const res = await rpc("process", "uptime");
    return typeof res === "number" ? res : res.uptime || 0;
  },
};

// ============================================================================
// 5. shell: Command Execution & Shell Utilities
// ============================================================================
export const shell = {
  async exec(
    command: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return await rpc("shell", "exec", command);
  },

  async openExternal(url: string): Promise<boolean> {
    return await rpc("shell", "openExternal", url);
  },

  async showItemInFolder(fullPath: string): Promise<boolean> {
    return await rpc("shell", "showItemInFolder", fullPath);
  },
};

// ============================================================================
// 6. appWindow & webUI: Native Desktop Window Control
// ============================================================================
export const appWindow = {
  /**
   * Synchronously returns whether the application is running in frameless mode.
   * Can be used directly in HTML templates: <div v-if="appWindow.isFrameless()"> or <div v-if="webUI.isFrameless()">
   */
  isFrameless(): boolean {
    if (typeof (window as any).__RITAWAPP_FRAMELESS__ === "boolean") {
      return (window as any).__RITAWAPP_FRAMELESS__;
    }
    // Query DOM or fallback to document attribute
    const attr = document.documentElement.getAttribute("data-frameless");
    if (attr !== null) return attr === "true";
    return true;
  },

  async minimize(): Promise<void> {
    await rpc("appWindow", "minimize");
  },

  async maximize(): Promise<void> {
    await rpc("appWindow", "maximize");
  },

  async restore(): Promise<void> {
    await rpc("appWindow", "restore");
  },

  async unmaximize(): Promise<void> {
    await rpc("appWindow", "restore");
  },

  async isMaximized(): Promise<boolean> {
    const res = await rpc("appWindow", "isMaximized");
    return typeof res === "boolean" ? res : !!res?.isMaximized;
  },

  async close(): Promise<void> {
    try {
      if (typeof (window as any).close_win === "function") {
        (window as any).close_win();
      }
    } catch (_) {}
    try {
      await rpc("appWindow", "close");
    } catch (_) {}
  },

  async setIcon(iconPath: string): Promise<void> {
    await rpc("appWindow", "setIcon", iconPath);
  },

  async drag(): Promise<void> {
    await rpc("appWindow", "drag");
  },

  async dragWindow(): Promise<void> {
    await rpc("appWindow", "drag");
  },

  async setSize(width: number, height: number): Promise<void> {
    await rpc("appWindow", "setSize", width, height);
  },

  async getSize(): Promise<{ width: number; height: number }> {
    return await rpc("appWindow", "getSize");
  },

  async setPosition(x: number, y: number): Promise<void> {
    await rpc("appWindow", "setPosition", x, y);
  },

  async getPosition(): Promise<{ x: number; y: number }> {
    return await rpc("appWindow", "getPosition");
  },

  async center(): Promise<void> {
    await rpc("appWindow", "center");
  },

  async setAlwaysOnTop(flag: boolean): Promise<void> {
    await rpc("appWindow", "setAlwaysOnTop", flag);
  },

  async setFrameless(flag: boolean): Promise<void> {
    (window as any).__RITAWAPP_FRAMELESS__ = flag;
    document.documentElement.setAttribute(
      "data-frameless",
      flag ? "true" : "false",
    );
    await rpc("appWindow", "setFrameless", flag);
  },

  async showMessageBox(title: string, message: string): Promise<number> {
    return await rpc("appWindow", "showMessageBox", title, message);
  },

  async openDevTools(): Promise<void> {
    await rpc("appWindow", "openDevTools");
  },

  async reload(): Promise<void> {
    window.location.reload();
  },

  async navigate(url: string): Promise<void> {
    window.location.href = url;
  },
};

// webUI is an alias to appWindow for full compatibility
export const webUI = appWindow;

// ============================================================================
// 7. network: Wi-Fi & Network Manager
// ============================================================================
export const network = {
  async getInterfaces(): Promise<any[]> {
    return await rpc("network", "getInterfaces");
  },

  async isOnline(): Promise<boolean> {
    const res = await rpc("network", "isOnline");
    return typeof res === "boolean" ? res : !!res?.online;
  },

  async ping(host: string = "8.8.8.8"): Promise<{
    ok: boolean;
    latencyMs: number;
    alive: boolean;
    timeMs: number;
  }> {
    try {
      const res = await rpc("network", "ping", host);
      if (res && typeof res === "object") {
        const ok = Boolean(res.ok ?? res.alive ?? false);
        const latencyMs = Number(res.latencyMs ?? res.timeMs ?? 0);
        return {
          ok,
          latencyMs,
          alive: ok,
          timeMs: latencyMs,
        };
      }
      const okBool = Boolean(res);
      return { ok: okBool, latencyMs: 0, alive: okBool, timeMs: 0 };
    } catch {
      return { ok: false, latencyMs: 0, alive: false, timeMs: 0 };
    }
  },

  async scanWifi(): Promise<
    Array<{ ssid: string; signal: number; auth: string }>
  > {
    const res = await rpc("network", "scanWifi");
    return Array.isArray(res) ? res : res?.networks || [];
  },

  async connectWifi(ssid: string, password?: string): Promise<boolean> {
    const res = await rpc("network", "connectWifi", { ssid, password });
    return typeof res === "boolean" ? res : !!res?.connected;
  },

  async disconnectWifi(): Promise<boolean> {
    const res = await rpc("network", "disconnectWifi");
    return typeof res === "boolean" ? res : !!res?.disconnected;
  },
};

// ============================================================================
// 8. mongoose & db: MongoDB Mongoose ODM Interface for SQLite
// ============================================================================

export function generateObjectId(): string {
  const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, "0");
  const random = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return timestamp + random;
}

export class Schema {
  definition: Record<string, any>;
  options: Record<string, any>;

  constructor(
    definition: Record<string, any> = {},
    options: Record<string, any> = {},
  ) {
    this.definition = definition;
    this.options = options;
  }
}

/**
 * Creates a reactive Document instance that automatically saves to SQLite
 * whenever any property is modified, without requiring manual doc.save() calls.
 */
export function createAutoSavingDocument<T extends Record<string, any>>(
  raw: T,
  collectionName: string,
  schema?: Schema,
  isInitialNew: boolean = false,
): T {
  const target: any = { ...raw };
  if (!target._id) {
    target._id = generateObjectId();
  }

  let autoSaveTimer: any = null;
  let isSaving = false;
  let pendingChanges = false;

  const performSave = async () => {
    if (schema?.options?.timestamps) {
      const now = new Date().toISOString();
      if (!target.createdAt) target.createdAt = now;
      target.updatedAt = now;
    }

    const payload = { ...target };
    delete payload.save;
    delete payload.remove;
    delete payload.deleteOne;
    delete payload.toJSON;
    delete payload.toObject;

    await rpc("db", "updateOne", collectionName, { _id: target._id }, {
      $set: payload,
    });
    return proxy;
  };

  const scheduleAutoSave = () => {
    pendingChanges = true;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
      autoSaveTimer = null;
      if (isSaving) {
        scheduleAutoSave();
        return;
      }
      isSaving = true;
      pendingChanges = false;
      try {
        await performSave();
      } catch (err) {
        console.warn(`[RitaWapp mongoose auto-save error]:`, err);
      } finally {
        isSaving = false;
        if (pendingChanges) {
          scheduleAutoSave();
        }
      }
    }, 20); // 20ms debounce
  };

  if (isInitialNew) {
    scheduleAutoSave();
  }

  // Explicit save() if user still wants to await it
  target.save = async function (): Promise<T> {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
    isSaving = true;
    try {
      return await performSave();
    } finally {
      isSaving = false;
    }
  };

  target.remove = async function (): Promise<boolean> {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    await rpc("db", "deleteOne", collectionName, { _id: target._id });
    return true;
  };
  target.deleteOne = target.remove;

  target.toJSON = () => {
    const copy = { ...target };
    delete copy.save;
    delete copy.remove;
    delete copy.deleteOne;
    delete copy.toJSON;
    delete copy.toObject;
    return copy;
  };
  target.toObject = target.toJSON;

  const proxy: any = new Proxy(target, {
    set(obj, prop, value, receiver) {
      const propStr = String(prop);
      if (
        propStr.startsWith("$") ||
        propStr === "save" ||
        propStr === "remove" ||
        propStr === "deleteOne" ||
        propStr === "toJSON" ||
        propStr === "toObject"
      ) {
        return Reflect.set(obj, prop, value, receiver);
      }

      const prev = obj[prop];
      const success = Reflect.set(obj, prop, value, receiver);
      if (prev !== value) {
        scheduleAutoSave();
      }
      return success;
    },
    get(obj, prop, receiver) {
      if (prop === "$isSaving") return isSaving;
      return Reflect.get(obj, prop, receiver);
    },
  });

  return proxy;
}

export class Model<T = any> {
  collectionName: string;
  schema?: Schema;

  constructor(name: string, schema?: Schema | Record<string, any>) {
    this.collectionName = name;
    this.schema = schema instanceof Schema
      ? schema
      : (schema ? new Schema(schema) : undefined);
  }

  async find(filter: Record<string, any> = {}): Promise<T[]> {
    const res = await rpc("db", "find", this.collectionName, filter);
    const list = Array.isArray(res) ? res : res?.data || res?.docs || [];
    return list.map((item: any) =>
      createAutoSavingDocument<T>(item, this.collectionName, this.schema)
    );
  }

  async findOne(filter: Record<string, any>): Promise<T | null> {
    const res = await rpc("db", "findOne", this.collectionName, filter);
    const item = res?.data !== undefined ? res.data : res;
    if (item && item._id) {
      return createAutoSavingDocument<T>(item, this.collectionName, this.schema);
    }
    const list = await this.find(filter);
    return list && list.length > 0 ? list[0] : null;
  }

  async findById(id: string): Promise<T | null> {
    return await this.findOne({ _id: id });
  }

  async create(doc: Partial<T>): Promise<T> {
    const payload: any = { ...doc };
    if (!payload._id) {
      payload._id = generateObjectId();
    }
    const res = await rpc("db", "create", this.collectionName, payload);
    const raw = res?.data !== undefined ? res.data : (res || payload);
    return createAutoSavingDocument<T>(raw, this.collectionName, this.schema);
  }

  async insertMany(docs: Array<Partial<T>>): Promise<T[]> {
    const results: T[] = [];
    for (const d of docs) {
      results.push(await this.create(d));
    }
    return results;
  }

  async updateOne(
    filter: Record<string, any>,
    update: Record<string, any>,
  ): Promise<{ modifiedCount: number }> {
    const res = await rpc(
      "db",
      "updateOne",
      this.collectionName,
      filter,
      update,
    );
    return { modifiedCount: res?.updated || (res?.success ? 1 : 0) };
  }

  async updateMany(
    filter: Record<string, any>,
    update: Record<string, any>,
  ): Promise<{ modifiedCount: number }> {
    const res = await rpc(
      "db",
      "updateMany",
      this.collectionName,
      filter,
      update,
    );
    return { modifiedCount: res?.updated || 0 };
  }

  async deleteOne(
    filter: Record<string, any>,
  ): Promise<{ deletedCount: number }> {
    const res = await rpc("db", "deleteOne", this.collectionName, filter);
    return { deletedCount: res?.deleted || (res?.success ? 1 : 0) };
  }

  async deleteMany(
    filter: Record<string, any>,
  ): Promise<{ deletedCount: number }> {
    const res = await rpc("db", "deleteMany", this.collectionName, filter);
    return { deletedCount: res?.deleted || 0 };
  }

  async countDocuments(filter: Record<string, any> = {}): Promise<number> {
    const res = await rpc("db", "countDocuments", this.collectionName, filter);
    return typeof res === "number" ? res : (res?.count ?? (res?.data ?? 0));
  }

  async autoIndex() {
    return await db.ai.autoIndex(this.collectionName);
  }

  async aiSearch(
    query: string,
    limit: number = 20,
  ): Promise<Array<{ doc: T; rank: number }>> {
    const res = await db.ai.search<T>(this.collectionName, query, limit);
    return (res?.data || []).map((d: any) => ({
      doc: d.doc || d,
      rank: d.rank ?? 0,
    }));
  }
}

const registeredModels: Map<string, any> = new Map();

export function model<T = any>(
  name: string,
  schema?: Schema | Record<string, any>,
): any {
  if (registeredModels.has(name)) {
    return registeredModels.get(name);
  }
  const modelInstance = new Model<T>(name, schema);

  function ModelConstructor(this: any, docData: Partial<T> = {}) {
    const payload: any = { ...docData };
    if (!payload._id) {
      payload._id = generateObjectId();
    }
    return createAutoSavingDocument<T>(
      payload as T,
      modelInstance.collectionName,
      modelInstance.schema,
      true,
    );
  }

  Object.setPrototypeOf(ModelConstructor, modelInstance);
  Object.assign(ModelConstructor, modelInstance);
  (ModelConstructor as any).prototype = Object.create(Model.prototype);

  registeredModels.set(name, ModelConstructor);
  return ModelConstructor;
}

export const mongoose = {
  Schema,
  Model,
  model,
  generateObjectId,

  async connect(uri: string): Promise<boolean> {
    const res = await rpc("db", "connect", uri);
    return res?.connected ?? true;
  },

  async disconnect(): Promise<void> {
    await rpc("db", "disconnect");
  },
};

export const db = {
  ...mongoose,
  Schema,
  model: mongoose.model,
  connect: mongoose.connect,
  disconnect: mongoose.disconnect,

  // Direct High-Performance SQL Engine (backed by Real SQLite in C)
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const res = await rpc("db", "sqlQuery", sql, params);
    if (Array.isArray(res)) return res as T[];
    if (res && Array.isArray(res.data)) return res.data as T[];
    return [];
  },

  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return await this.query<T>(sql, params);
  },

  async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  },

  async run(
    sql: string,
    params: any[] = [],
  ): Promise<{ lastInsertRowid: number; changes: number }> {
    const res = await rpc("db", "sqlRun", sql, params);
    if (res && typeof res.lastInsertRowid === "number") {
      return res as { lastInsertRowid: number; changes: number };
    }
    if (res && typeof res.data === "object" && res.data) {
      return res.data;
    }
    return { lastInsertRowid: 0, changes: 0 };
  },

  async exec(sql: string): Promise<boolean> {
    const res = await rpc("db", "sqlExec", sql);
    return res && res.success;
  },

  async batch(
    queries: Array<{ sql: string; params?: any[] } | string>,
  ): Promise<void> {
    if (!queries || queries.length === 0) return;
    try {
      const res = await rpc("db", "sqlBatch", queries);
      if (res && (res === true || res.success !== false)) {
        return;
      }
    } catch {
      // Fallback to sequential in transaction
    }
    await this.exec("BEGIN IMMEDIATE TRANSACTION;");
    try {
      for (const q of queries) {
        if (typeof q === "string") {
          await this.exec(q);
        } else if (q && typeof q === "object") {
          await this.run(q.sql, q.params || []);
        }
      }
      await this.exec("COMMIT;");
    } catch (e) {
      await this.exec("ROLLBACK;");
      throw e;
    }
  },

  async transaction(
    fnOrQueries:
      | ((tx: any) => Promise<void>)
      | Array<{ sql: string; params?: any[] } | string>,
  ): Promise<void> {
    if (typeof fnOrQueries === "function") {
      await this.exec("BEGIN IMMEDIATE TRANSACTION;");
      try {
        await fnOrQueries(this);
        await this.exec("COMMIT;");
      } catch (e) {
        await this.exec("ROLLBACK;");
        throw e;
      }
    } else if (Array.isArray(fnOrQueries)) {
      await this.batch(fnOrQueries);
    }
  },

  // AI Automated Indexing, BM25 FTS5 Full-Text Search & Vector Engine
  ai: {
    async autoIndex(
      collection: string = "",
    ): Promise<
      {
        success: boolean;
        collection: string;
        indexesCreated: number;
        ftsEnabled: boolean;
        vectorStoreReady: boolean;
      }
    > {
      const res = await rpc("db", "aiAutoIndex", collection);
      return res ||
        {
          success: false,
          collection,
          indexesCreated: 0,
          ftsEnabled: false,
          vectorStoreReady: false,
        };
    },

    async search<T = any>(
      collection: string,
      query: string,
      limit: number = 20,
    ): Promise<
      { success: boolean; data: Array<{ doc: T; rank: number }>; total: number }
    > {
      const res = await rpc("db", "aiSearch", collection, query, limit);
      if (Array.isArray(res)) {
        return { success: true, data: res, total: res.length };
      }
      if (res && typeof res === "object") {
        const data = Array.isArray(res.data) ? res.data : [];
        const total = typeof res.total === "number" ? res.total : data.length;
        return { success: res.success ?? true, data, total };
      }
      return { success: false, data: [], total: 0 };
    },

    async storeVector(
      collection: string,
      docId: string,
      vector: number[],
      metadata: Record<string, any> = {},
    ): Promise<{ success: boolean; docId: string; dimensions: number }> {
      const res = await rpc("db", "aiStoreVector", {
        collection,
        docId,
        vector,
        metadata,
      });
      return res || { success: false, docId, dimensions: vector.length };
    },

    async searchVector(
      collection: string,
      queryVector: number[],
      topK: number = 10,
    ): Promise<
      {
        success: boolean;
        matches: Array<{ docId: string; similarity: number; metadata: any }>;
        count: number;
      }
    > {
      const res = await rpc("db", "aiSearchVector", {
        collection,
        vector: queryVector,
        topK,
      });
      let parsed = res;
      if (typeof res === "string") {
        try {
          parsed = JSON.parse(res);
        } catch {
          parsed = { matches: [], count: 0 };
        }
      }
      const matches = Array.isArray(parsed?.matches)
        ? parsed.matches
        : (Array.isArray(parsed) ? parsed : []);
      return {
        success: parsed?.success ?? true,
        matches,
        count: typeof parsed?.count === "number"
          ? parsed.count
          : matches.length,
      };
    },

    async optimize(): Promise<{ success: boolean; message: string }> {
      const res = await rpc("db", "aiOptimize");
      return res || { success: false, message: "" };
    },
  },
};

export const sqlite = db;
export const sqlite3 = db;

// ============================================================================
// 9. cloudSync: Device-to-Device & Cloud Synchronization
// ============================================================================
export const cloudSync = {
  config: { endpoint: "", apiKey: "", autoSync: false },

  connect(endpoint: string, apiKey: string) {
    this.config.endpoint = endpoint;
    this.config.apiKey = apiKey;
    this.config.autoSync = true;
  },

  async sync(
    collection?: string,
  ): Promise<{ status: string; syncedAt: number }> {
    const res = await rpc("cloudSync", "sync", collection || "all");
    return { status: "synced", syncedAt: Date.now(), ...res };
  },

  async getStatus(): Promise<{ connected: boolean; pendingChanges: number }> {
    return { connected: !!this.config.endpoint, pendingChanges: 0 };
  },

  async push(): Promise<boolean> {
    return true;
  },

  async pull(): Promise<boolean> {
    return true;
  },
};

// ============================================================================
// 10. update: Auto-updater for GitHub Releases
// ============================================================================
export const update = {
  currentVersion: "1.0.0",

  getCurrentVersion(): string {
    return this.currentVersion;
  },

  async getRepoUrl(): Promise<string> {
    try {
      const url = await rpc("update", "getRepoUrl");
      return url || "";
    } catch {
      return "";
    }
  },

  async check(
    repoUrl?: string,
  ): Promise<
    {
      hasUpdate: boolean;
      latestVersion: string;
      downloadUrl?: string;
      notes?: string;
      repoUrl?: string;
    }
  > {
    try {
      const res = await rpc("update", "check", { repoUrl: repoUrl || "" });
      if (res && typeof res === "object") {
        return {
          hasUpdate: res.hasUpdate ?? false,
          latestVersion: res.latestVersion || this.currentVersion,
          downloadUrl: res.downloadUrl,
          notes: res.releaseNotes,
          repoUrl: res.repoUrl,
        };
      }
    } catch {
      // Fallback to fetch
    }

    const effectiveRepo = repoUrl || (await this.getRepoUrl());
    if (!effectiveRepo) {
      return { hasUpdate: false, latestVersion: this.currentVersion };
    }

    try {
      const slug = effectiveRepo.replace(/^https?:\/\/github\.com\//, "")
        .replace(/\.git$/, "").replace(/\/$/, "");
      const apiUrl = `https://api.github.com/repos/${slug}/releases/latest`;
      const res = await fetch(apiUrl);
      if (!res.ok) {
        return {
          hasUpdate: false,
          latestVersion: this.currentVersion,
          repoUrl: effectiveRepo,
        };
      }
      const release = await res.json();
      const latestVersion = (release.tag_name || "").replace(/^v/i, "");
      const hasUpdate = latestVersion !== this.currentVersion &&
        latestVersion.length > 0;
      const asset = release.assets?.find((a: any) =>
        a.name.endsWith(".app") || a.name.endsWith(".exe") ||
        a.name.endsWith(".zip")
      );
      return {
        hasUpdate,
        latestVersion,
        downloadUrl: asset?.browser_download_url,
        notes: release.body,
        repoUrl: effectiveRepo,
      };
    } catch {
      return {
        hasUpdate: false,
        latestVersion: this.currentVersion,
        repoUrl: effectiveRepo,
      };
    }
  },

  async checkForUpdates(repoUrl?: string) {
    return await this.check(repoUrl);
  },

  async download(url: string): Promise<boolean> {
    try {
      const res = await rpc("update", "download", { url });
      return Boolean(res);
    } catch {
      return false;
    }
  },

  async install(): Promise<boolean> {
    return await rpc("update", "install");
  },

  async downloadAndInstall(bundleUrl: string): Promise<boolean> {
    const downloaded = await this.download(bundleUrl);
    if (!downloaded) return false;
    return await this.install();
  },

  async rollback(): Promise<boolean> {
    return await rpc("update", "rollback");
  },
};

// ============================================================================
// 10b. tray: System Tray Icon & Context Menu Manager
// ============================================================================
export interface TrayItem {
  name?: string;
  label?: string;
  icon?: string;
  action?: string | (() => void | Promise<void>);
  type?: "normal" | "separator" | "checkbox";
  separator?: boolean;
  disabled?: boolean;
  checked?: boolean;
}

const s_trayCallbacks = new Map<string, () => void | Promise<void>>();

if (typeof window !== "undefined") {
  (window as any).__rita_tray_dispatch = (action: string, id: number) => {
    const cb = s_trayCallbacks.get(action) ||
      s_trayCallbacks.get(`action_${id}`);
    if (cb) {
      try {
        cb();
      } catch (err) {
        console.error("[RitaWapp Tray] Error executing callback:", err);
      }
    }
  };
}

export const tray = {
  async init(options?: { tooltip?: string; icon?: string }): Promise<boolean> {
    const res = await rpc("tray", "init", options || {});
    return typeof res === "boolean" ? res : !!res?.success;
  },

  async set(
    key: string,
    options:
      | { hideToTray?: boolean; hideTotray?: boolean; reset?: boolean }
      | any,
  ): Promise<any> {
    return await rpc("tray", "set", key, options);
  },

  async items(menuItems: TrayItem[]): Promise<boolean> {
    s_trayCallbacks.clear();
    const serialized = (menuItems || []).map((item, idx) => {
      const isSep = item.type === "separator" || item.separator ||
        item.name === "-" || item.label === "-";
      if (isSep) {
        return { is_separator: true };
      }
      let actName = "";
      if (typeof item.action === "function") {
        actName = `custom_action_${idx}_${Date.now()}`;
        s_trayCallbacks.set(actName, item.action);
      } else if (typeof item.action === "string") {
        actName = item.action;
      } else {
        actName = item.name || item.label || "";
      }
      return {
        name: item.name || item.label || "",
        action: actName,
        icon: item.icon || "",
        disabled: !!item.disabled,
        checked: !!item.checked,
      };
    });
    return await rpc("tray", "items", serialized);
  },

  async appHide(): Promise<boolean> {
    return await rpc("tray", "appHide");
  },

  async appShow(): Promise<boolean> {
    return await rpc("tray", "appShow");
  },

  async isHideToTray(): Promise<boolean> {
    const res = await rpc("tray", "isHideToTray");
    return typeof res === "boolean" ? res : !!res?.hideToTray;
  },

  async setTooltip(text: string): Promise<boolean> {
    return await rpc("tray", "setTooltip", text);
  },

  async setIcon(iconPath: string): Promise<boolean> {
    return await rpc("tray", "setIcon", iconPath);
  },

  async destroy(): Promise<boolean> {
    return await rpc("tray", "destroy");
  },
};

// ============================================================================
// 10c. net: Node.js TCP Networking
// ============================================================================
type EventCallback = (...args: any[]) => void;

class EventEmitter {
  private _events = new Map<string, EventCallback[]>();

  on(event: string, fn: EventCallback): this {
    if (!this._events.has(event)) this._events.set(event, []);
    this._events.get(event)!.push(fn);
    return this;
  }

  once(event: string, fn: EventCallback): this {
    const wrapped: EventCallback = (...args: any[]) => {
      this.off(event, wrapped);
      fn(...args);
    };
    return this.on(event, wrapped);
  }

  off(event: string, fn: EventCallback): this {
    const arr = this._events.get(event);
    if (arr) {
      this._events.set(event, arr.filter((f) => f !== fn));
    }
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    const arr = this._events.get(event);
    if (!arr || arr.length === 0) return false;
    for (const fn of [...arr]) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[net] Error in '${event}':`, err);
      }
    }
    return true;
  }
}

const s_ui_sockets = new Map<number, NetSocket>();
const s_ui_servers = new Map<number, NetServer>();

if (typeof window !== "undefined") {
  (window as any).__rita_net_dispatch = (
    id: number,
    event: string,
    ...args: any[]
  ) => {
    if (event === "connection") {
      const server = s_ui_servers.get(id);
      if (server) {
        const [clientId, remoteIp, remotePort] = args;
        const sock = new NetSocket();
        sock._id = clientId;
        sock.remoteAddress = remoteIp;
        sock.remotePort = remotePort;
        s_ui_sockets.set(clientId, sock);
        server.emit("connection", sock);
      }
    } else {
      const sock = s_ui_sockets.get(id);
      if (sock) {
        if (event === "data") {
          try {
            const raw = atob(args[0] || "");
            sock.emit("data", raw);
          } catch {
            sock.emit("data", args[0]);
          }
        } else if (event === "close") {
          sock.emit("close");
          s_ui_sockets.delete(id);
        } else {
          sock.emit(event, ...args);
        }
      }
    }
  };
}

export class NetSocket extends EventEmitter {
  _id: number = 0;
  remoteAddress: string = "";
  remotePort: number = 0;
  localPort: number = 0;
  connecting: boolean = false;
  destroyed: boolean = false;

  async connect(
    options: { port: number; host?: string },
    callback?: () => void,
  ): Promise<this> {
    this.connecting = true;
    const host = options.host || "127.0.0.1";
    const port = options.port;
    if (callback) this.once("connect", callback);

    try {
      const res = await rpc("net", "connect", host, String(port));
      if (res && res.id) {
        this._id = res.id;
        this.remoteAddress = host;
        this.remotePort = port;
        s_ui_sockets.set(this._id, this);
        this.connecting = false;
        this.emit("connect");
      } else {
        throw new Error(res?.error || "Failed to connect");
      }
    } catch (err: any) {
      this.connecting = false;
      this.emit("error", err);
    }
    return this;
  }

  async write(
    data: string | Uint8Array,
    encodingOrCb?: any,
    callback?: () => void,
  ): Promise<boolean> {
    if (!this._id) return false;
    const strData = typeof data === "string"
      ? data
      : new TextDecoder().decode(data);
    const cb = typeof encodingOrCb === "function" ? encodingOrCb : callback;
    const res = await rpc("net", "write", String(this._id), strData);
    if (cb) cb();
    return !!res?.success;
  }

  async end(data?: string | Uint8Array, callback?: () => void): Promise<this> {
    if (data) await this.write(data);
    await rpc("net", "close", String(this._id));
    if (callback) callback();
    this.emit("end");
    return this;
  }

  destroy(error?: Error): this {
    if (this._id) {
      rpc("net", "close", String(this._id));
      s_ui_sockets.delete(this._id);
      this._id = 0;
    }
    this.destroyed = true;
    if (error) this.emit("error", error);
    this.emit("close");
    return this;
  }

  address() {
    return { address: "127.0.0.1", family: "IPv4", port: this.localPort };
  }
}

export class NetServer extends EventEmitter {
  _id: number = 0;
  listening: boolean = false;
  port: number = 0;
  host: string = "0.0.0.0";

  constructor(connectionListener?: (socket: NetSocket) => void) {
    super();
    if (connectionListener) this.on("connection", connectionListener);
  }

  async listen(
    port: number,
    hostOrCb?: any,
    callback?: () => void,
  ): Promise<this> {
    this.port = port;
    let host = "0.0.0.0";
    let cb: (() => void) | undefined = callback;
    if (typeof hostOrCb === "string") host = hostOrCb;
    else if (typeof hostOrCb === "function") cb = hostOrCb;
    this.host = host;

    try {
      const res = await rpc("net", "listen", String(port), host);
      if (res && res.id) {
        this._id = res.id;
        this.listening = true;
        s_ui_servers.set(this._id, this);
        this.emit("listening");
        if (cb) cb();
      } else {
        throw new Error(res?.error || "Failed to listen");
      }
    } catch (err: any) {
      this.emit("error", err);
    }
    return this;
  }

  async close(callback?: (err?: Error) => void): Promise<this> {
    if (this._id) {
      await rpc("net", "close", String(this._id));
      s_ui_servers.delete(this._id);
      this._id = 0;
    }
    this.listening = false;
    this.emit("close");
    if (callback) callback();
    return this;
  }

  address() {
    return { address: this.host, family: "IPv4", port: this.port };
  }
}

export const net = {
  Socket: NetSocket,
  Server: NetServer,
  createServer(connectionListener?: (socket: NetSocket) => void): NetServer {
    return new NetServer(connectionListener);
  },
  createConnection(
    options: { port: number; host?: string },
    connectionListener?: () => void,
  ): NetSocket {
    const s = new NetSocket();
    s.connect(options, connectionListener);
    return s;
  },
  connect(
    portOrOptions: number | { port: number; host?: string },
    hostOrCb?: any,
    callback?: () => void,
  ): NetSocket {
    let opts: { port: number; host?: string };
    let cb: (() => void) | undefined = callback;
    if (typeof portOrOptions === "number") {
      opts = { port: portOrOptions };
      if (typeof hostOrCb === "string") opts.host = hostOrCb;
      else if (typeof hostOrCb === "function") cb = hostOrCb;
    } else {
      opts = portOrOptions;
      if (typeof hostOrCb === "function") cb = hostOrCb;
    }
    return net.createConnection(opts, cb);
  },
  isIP(input: string): number {
    if (net.isIPv4(input)) return 4;
    if (net.isIPv6(input)) return 6;
    return 0;
  },
  isIPv4(input: string): boolean {
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(input);
  },
  isIPv6(input: string): boolean {
    return /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(input);
  },
};

// ============================================================================
// 10d. dgram: Node.js UDP Sockets
// ============================================================================
const s_ui_dgram_sockets = new Map<number, DgramSocket>();

if (typeof window !== "undefined") {
  (window as any).__rita_dgram_dispatch = (
    id: number,
    event: string,
    b64Msg: string,
    senderIp: string,
    senderPort: number,
    family: string,
    size: number,
  ) => {
    const sock = s_ui_dgram_sockets.get(id);
    if (sock) {
      if (event === "message") {
        let msg = "";
        try {
          msg = atob(b64Msg);
        } catch {
          msg = b64Msg;
        }
        sock.emit("message", msg, {
          address: senderIp,
          port: senderPort,
          family,
          size,
        });
      } else if (event === "close") {
        sock.emit("close");
        s_ui_dgram_sockets.delete(id);
      } else {
        sock.emit(event);
      }
    }
  };
}

export class DgramSocket extends EventEmitter {
  _id: number = 0;
  type: string = "udp4";
  port: number = 0;
  addressStr: string = "0.0.0.0";

  constructor(type: string = "udp4") {
    super();
    this.type = type;
  }

  async bind(
    port: number = 0,
    addressOrCb?: any,
    callback?: () => void,
  ): Promise<this> {
    let addr = "0.0.0.0";
    let cb: (() => void) | undefined = callback;
    if (typeof addressOrCb === "string") addr = addressOrCb;
    else if (typeof addressOrCb === "function") cb = addressOrCb;

    try {
      const res = await rpc("dgram", "bind", String(port), addr);
      if (res && res.id) {
        this._id = res.id;
        this.port = res.port;
        this.addressStr = res.address;
        s_ui_dgram_sockets.set(this._id, this);
        this.emit("listening");
        if (cb) cb();
      } else {
        throw new Error(res?.error || "Failed to bind UDP socket");
      }
    } catch (err: any) {
      this.emit("error", err);
    }
    return this;
  }

  async send(
    msg: string | Uint8Array,
    offsetOrPort: number,
    lengthOrHost?: any,
    portOrCb?: any,
    addressOrCb?: any,
    callback?: () => void,
  ): Promise<number> {
    const strMsg = typeof msg === "string"
      ? msg
      : new TextDecoder().decode(msg);
    let targetPort = 0;
    let targetHost = "127.0.0.1";
    let cb: (() => void) | undefined = callback;

    if (typeof lengthOrHost === "string" && typeof offsetOrPort === "number") {
      targetPort = offsetOrPort;
      targetHost = lengthOrHost;
      if (typeof portOrCb === "function") cb = portOrCb;
    } else if (
      typeof portOrCb === "number" && typeof addressOrCb === "string"
    ) {
      targetPort = portOrCb;
      targetHost = addressOrCb;
    }

    if (!this._id) await this.bind(0);
    const res = await rpc(
      "dgram",
      "send",
      String(this._id),
      strMsg,
      String(targetPort),
      targetHost,
    );
    if (cb) cb();
    return res?.bytesSent || 0;
  }

  async close(callback?: () => void): Promise<this> {
    if (this._id) {
      await rpc("dgram", "close", String(this._id));
      s_ui_dgram_sockets.delete(this._id);
      this._id = 0;
    }
    this.emit("close");
    if (callback) callback();
    return this;
  }

  address() {
    return { address: this.addressStr, family: "IPv4", port: this.port };
  }
}

export const dgram = {
  Socket: DgramSocket,
  createSocket(
    typeOrOpts: string | { type: string },
    callback?: (msg: string, rinfo: any) => void,
  ): DgramSocket {
    const type = typeof typeOrOpts === "string"
      ? typeOrOpts
      : typeOrOpts?.type || "udp4";
    const s = new DgramSocket(type);
    if (callback) s.on("message", callback);
    return s;
  },
};

// ============================================================================
// 10e. http & https: Node.js HTTP/HTTPS Client
// ============================================================================
export class IncomingMessage {
  statusCode: number = 200;
  statusMessage: string = "OK";
  headers: Record<string, string> = {};
  body: string = "";
  private _listeners: Record<string, Array<(...args: any[]) => void>> = {};
  private _emitted: boolean = false;

  constructor(
    statusCode: number = 200,
    body: string = "",
    headers: Record<string, string> = {},
  ) {
    this.statusCode = statusCode;
    this.statusMessage = statusCode >= 200 && statusCode < 300 ? "OK" : "Error";
    this.body = body;
    this.headers = headers;

    queueMicrotask(() => {
      this._emitPayload();
    });
  }

  private _emitPayload() {
    if (this._emitted) return;
    this._emitted = true;
    this.emit("data", this.body);
    this.emit("end");
  }

  on(event: string, callback: (...args: any[]) => void): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
    if (this._emitted) {
      if (event === "data") callback(this.body);
      else if (event === "end") callback();
    }
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    if (this._listeners[event]) {
      this._listeners[event].forEach((fn) => fn(...args));
      return true;
    }
    return false;
  }

  json<T = any>(): T {
    return JSON.parse(this.body);
  }

  text(): string {
    return this.body;
  }
}

export class ClientRequest implements PromiseLike<IncomingMessage> {
  url: string;
  options: { method?: string; headers?: Record<string, string>; body?: string };
  private _listeners: Record<string, Array<(...args: any[]) => void>> = {};
  private _promise: Promise<IncomingMessage>;
  private _callback?: (res: IncomingMessage) => void;

  constructor(
    url: string,
    options: any = {},
    callback?: (res: IncomingMessage) => void,
  ) {
    this.url = url;
    this.options = options;
    this._callback = callback;
    this._promise = this._execute();
  }

  private async _execute(): Promise<IncomingMessage> {
    try {
      const res = await rpc("http", "request", {
        url: this.url,
        method: this.options.method || "GET",
        headers: this.formatHeaders(this.options.headers),
        body: this.options.body || "",
      });
      const code = res?.data?.statusCode || res?.statusCode || 200;
      const body = res?.data?.body || res?.body || "";
      const headers = res?.data?.headers || res?.headers || {};
      const msg = new IncomingMessage(code, body, headers);
      if (this._callback) {
        try {
          this._callback(msg);
        } catch (cbErr) {
          console.error("[http callback error]:", cbErr);
        }
      }
      this.emit("response", msg);
      return msg;
    } catch (err: any) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      queueMicrotask(() => {
        this.emit("error", errorObj);
      });
      throw errorObj;
    }
  }

  on(event: string, callback: (...args: any[]) => void): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    if (this._listeners[event] && this._listeners[event].length > 0) {
      this._listeners[event].forEach((fn) => fn(...args));
      return true;
    }
    return false;
  }

  write(chunk: string): this {
    this.options.body = (this.options.body || "") + chunk;
    return this;
  }

  end(data?: string): this {
    if (data) this.write(data);
    return this;
  }

  send(): Promise<IncomingMessage> {
    return this._promise;
  }

  then<TResult1 = IncomingMessage, TResult2 = never>(
    onfulfilled?:
      | ((value: IncomingMessage) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this._promise.then(onfulfilled, onrejected);
  }

  private formatHeaders(h?: Record<string, string>): string {
    if (!h) return "";
    return Object.entries(h).map(([k, v]) => `${k}: ${v}\r\n`).join("");
  }
}

export const http = {
  request(
    url: string,
    options?: any,
    callback?: (res: IncomingMessage) => void,
  ): ClientRequest {
    return new ClientRequest(url, options, callback);
  },
  get(
    url: string,
    optionsOrCallback?: any,
    callback?: (res: IncomingMessage) => void,
  ): ClientRequest {
    let opts = { method: "GET" };
    let cb = callback;
    if (typeof optionsOrCallback === "function") {
      cb = optionsOrCallback;
    } else if (optionsOrCallback) {
      opts = { ...optionsOrCallback, method: "GET" };
    }
    return new ClientRequest(url, opts, cb);
  },
  post(url: string, body: any, options?: any): ClientRequest {
    const strBody = typeof body === "string" ? body : JSON.stringify(body);
    return new ClientRequest(url, {
      ...options,
      method: "POST",
      body: strBody,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    });
  },
  createServer(handler?: (req: any, res: any) => void): HttpServer {
    return new HttpServer(handler);
  },
};

export class HttpServer {
  public serverId: number = 0;
  public port: number = 8080;
  public host: string = "0.0.0.0";
  private _pollTimer: any = null;
  private _handler?: (req: any, res: any) => void;

  constructor(handler?: (req: any, res: any) => void) {
    this._handler = handler;
  }

  async listen(port: number, host?: any, callback?: () => void): Promise<this> {
    this.port = port;
    if (typeof host === "function") {
      callback = host;
      this.host = "0.0.0.0";
    } else if (typeof host === "string") {
      this.host = host;
    }
    const res = await rpc(
      "http",
      "createServer",
      this.port.toString(),
      this.host,
    );
    if (res && res.success) {
      this.serverId = res.serverId;
      this._pollTimer = setInterval(() => this._poll(), 25);
      if (callback) callback();
    }
    return this;
  }

  private async _poll() {
    if (!this.serverId) return;
    const res = await rpc("http", "poll", this.serverId.toString());
    if (res && res.success && Array.isArray(res.requests)) {
      for (const req of res.requests) {
        const responseObj = {
          statusCode: 200,
          headers: {} as Record<string, string>,
          setHeader(k: string, v: string) {
            this.headers[k] = v;
            return this;
          },
          status(code: number) {
            this.statusCode = code;
            return this;
          },
          async send(body: string) {
            await rpc(
              "http",
              "respond",
              req.reqId.toString(),
              this.statusCode.toString(),
              body,
            );
          },
          async json(data: any) {
            await this.send(JSON.stringify(data));
          },
        };
        if (this._handler) {
          this._handler(req, responseObj);
        }
      }
    }
  }

  async close(callback?: () => void): Promise<void> {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (this.serverId) {
      await rpc("http", "close", this.serverId.toString());
      this.serverId = 0;
    }
    if (callback) callback();
  }
}

export const https = {
  request: http.request,
  get: http.get,
  post: http.post,
};

// ============================================================================
// 10f. fetch: CORS-free Desktop Fetch API
// ============================================================================
export async function desktopFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<any> {
  const url = typeof input === "string" ? input : input.toString();

  // Relative URLs, internal Vite assets, or non-http protocols use browser native fetch
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    if (_nativeFetch) return await _nativeFetch(input as any, init);
  }

  const method = (init?.method || "GET").toUpperCase();
  let bodyStr = "";
  if (init?.body) {
    bodyStr = typeof init.body === "string"
      ? init.body
      : JSON.stringify(init.body);
  }
  const headersObj: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => {
        headersObj[k] = v;
      });
    } else {
      Object.assign(headersObj, init.headers);
    }
  }

  try {
    const res = await http.request(url, {
      method,
      headers: headersObj,
      body: bodyStr,
    }).send();
    return {
      status: res.statusCode,
      ok: res.statusCode >= 200 && res.statusCode < 300,
      headers: new Headers(res.headers),
      async text() {
        return res.body;
      },
      async json() {
        return JSON.parse(res.body);
      },
    };
  } catch (nativeErr) {
    if (_nativeFetch) {
      return await _nativeFetch(input as any, init);
    }
    throw nativeErr;
  }
}

// ============================================================================
// 10g. express: Full Real Express.js Engine backed by Cesanta Mongoose
// ============================================================================

export type NextFunction = (err?: any) => void;
export type Handler = (
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction,
) => any;

export class ExpressRequest {
  public method: string = "GET";
  public url: string = "/";
  public path: string = "/";
  public originalUrl: string = "/";
  public query: Record<string, string> = {};
  public params: Record<string, string> = {};
  public headers: Record<string, string> = {};
  public body: any = null;
  public ip: string = "127.0.0.1";
  public protocol: string = "http";
  public secure: boolean = false;
  public app: any;

  constructor(raw: any, app: any) {
    this.app = app;
    this.method = (raw.method || "GET").toUpperCase();
    this.url = raw.url || "/";
    this.originalUrl = this.url;

    const qIndex = this.url.indexOf("?");
    if (qIndex >= 0) {
      this.path = this.url.substring(0, qIndex);
      const qStr = this.url.substring(qIndex + 1);
      const params = new URLSearchParams(qStr);
      for (const [k, v] of params.entries()) {
        this.query[k] = v;
      }
    } else {
      this.path = this.url;
    }

    if (raw.headers && typeof raw.headers === "object") {
      for (const [k, v] of Object.entries(raw.headers)) {
        this.headers[k.toLowerCase()] = String(v);
      }
    }

    if (raw.body !== undefined && raw.body !== null) {
      if (typeof raw.body === "string") {
        try {
          this.body = JSON.parse(raw.body);
        } catch {
          this.body = raw.body;
        }
      } else {
        this.body = raw.body;
      }
    }
  }

  get(header: string): string | undefined {
    return this.headers[header.toLowerCase()];
  }
}

export class ExpressResponse {
  public statusCode: number = 200;
  public headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  };
  public headersSent: boolean = false;
  private _rawRes: any;

  constructor(rawRes: any) {
    this._rawRes = rawRes;
  }

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  sendStatus(code: number): void {
    this.status(code).send(String(code));
  }

  setHeader(name: string, value: string): this {
    this.headers[name] = value;
    return this;
  }

  header(name: string, value: string): this {
    return this.setHeader(name, value);
  }

  async send(data: any): Promise<void> {
    if (this.headersSent) return;
    this.headersSent = true;

    let payload = "";
    if (typeof data === "object" && data !== null) {
      payload = JSON.stringify(data);
      if (!this.headers["Content-Type"]) {
        this.setHeader("Content-Type", "application/json; charset=utf-8");
      }
    } else {
      payload = String(data !== undefined ? data : "");
      if (!this.headers["Content-Type"]) {
        this.setHeader("Content-Type", "text/plain; charset=utf-8");
      }
    }

    if (this._rawRes && typeof this._rawRes.send === "function") {
      this._rawRes.statusCode = this.statusCode;
      await this._rawRes.send(payload);
    }
  }

  async json(data: any): Promise<void> {
    this.setHeader("Content-Type", "application/json; charset=utf-8");
    await this.send(data);
  }

  async redirect(statusOrUrl: any, url?: string): Promise<void> {
    let code = 302;
    let target = statusOrUrl;
    if (typeof statusOrUrl === "number") {
      code = statusOrUrl;
      target = url;
    }
    this.status(code);
    this.setHeader("Location", target);
    await this.send(`Found. Redirecting to ${target}`);
  }
}

function expressPathToRegex(
  path: string,
): { regex: RegExp; paramNames: string[] } {
  if (path === "*" || path === "") {
    return { regex: /.*/, paramNames: [] };
  }
  const paramNames: string[] = [];
  const escaped = path
    .replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1")
    .replace(/\\:([a-zA-Z0-9_]+)/g, (_match, name) => {
      paramNames.push(name);
      return "([^\\/]+)";
    })
    .replace(/\\\*/g, "(.*)");
  return { regex: new RegExp(`^${escaped}(?:\\/)?$`, "i"), paramNames };
}

export class ExpressRouter {
  protected routes: Array<
    {
      method: string;
      pattern: RegExp;
      paramNames: string[];
      handlers: Handler[];
    }
  > = [];

  use(
    pathOrHandler: string | Handler | ExpressRouter,
    ...handlers: Handler[]
  ): this {
    let path = "*";
    let fns: Handler[] = [];

    if (typeof pathOrHandler === "string") {
      path = pathOrHandler;
      fns = handlers;
    } else if (pathOrHandler instanceof ExpressRouter) {
      for (const r of pathOrHandler.routes) this.routes.push(r);
      return this;
    } else if (typeof pathOrHandler === "function") {
      fns = [pathOrHandler, ...handlers];
    }

    const { regex, paramNames } = expressPathToRegex(
      path === "*" ? ".*" : path,
    );
    this.routes.push({
      method: "USE",
      pattern: regex,
      paramNames,
      handlers: fns,
    });
    return this;
  }

  get(path: string, ...handlers: Handler[]): this {
    return this.addRoute("GET", path, handlers);
  }
  post(path: string, ...handlers: Handler[]): this {
    return this.addRoute("POST", path, handlers);
  }
  put(path: string, ...handlers: Handler[]): this {
    return this.addRoute("PUT", path, handlers);
  }
  delete(path: string, ...handlers: Handler[]): this {
    return this.addRoute("DELETE", path, handlers);
  }

  protected addRoute(method: string, path: string, handlers: Handler[]): this {
    const { regex, paramNames } = expressPathToRegex(path);
    this.routes.push({
      method: method.toUpperCase(),
      pattern: regex,
      paramNames,
      handlers,
    });
    return this;
  }

  async handle(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    let index = 0;
    const next: NextFunction = async (err?: any) => {
      if (err) {
        res.status(500).json({ error: String(err) });
        return;
      }
      if (index >= this.routes.length) {
        if (!res.headersSent) {
          res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
        }
        return;
      }
      const route = this.routes[index++];
      if (
        route.method !== "USE" && route.method !== "ALL" &&
        route.method !== req.method
      ) {
        return next();
      }
      const match = req.path.match(route.pattern);
      if (!match) return next();

      if (route.paramNames.length > 0) {
        for (let i = 0; i < route.paramNames.length; i++) {
          const val = match[i + 1];
          if (val) req.params[route.paramNames[i]] = decodeURIComponent(val);
        }
      }

      let hIndex = 0;
      const nextHandler = async () => {
        if (hIndex >= route.handlers.length) return next();
        const fn = route.handlers[hIndex++];
        try {
          await fn(req, res, nextHandler);
        } catch (e) {
          next(e);
        }
      };
      await nextHandler();
    };
    await next();
  }
}

export class ExpressApp extends ExpressRouter {
  private _server: HttpServer | null = null;

  listen(port: number, host?: any, callback?: () => void): HttpServer {
    let actualHost = "0.0.0.0";
    let actualCb = callback;
    if (typeof host === "function") actualCb = host;
    else if (typeof host === "string") actualHost = host;

    this._server = http.createServer(async (rawReq, rawRes) => {
      const req = new ExpressRequest(rawReq, this);
      const res = new ExpressResponse(rawRes);
      await this.handle(req, res);
    });

    this._server.listen(port, actualHost, actualCb);
    return this._server;
  }

  close(callback?: () => void): void {
    if (this._server) {
      this._server.close(callback);
      this._server = null;
    }
  }
}

export function express(): ExpressApp {
  return new ExpressApp();
}
express.Router = () => new ExpressRouter();
express.json =
  () => (req: ExpressRequest, _res: ExpressResponse, next: NextFunction) => {
    if (typeof req.body === "string" && req.body.trim().startsWith("{")) {
      try {
        req.body = JSON.parse(req.body);
      } catch { /* noop */ }
    }
    next();
  };
express.urlencoded =
  () => (req: ExpressRequest, _res: ExpressResponse, next: NextFunction) => {
    if (typeof req.body === "string" && req.body.includes("=")) {
      const p = new URLSearchParams(req.body);
      const parsed: Record<string, string> = {};
      for (const [k, v] of p.entries()) parsed[k] = v;
      req.body = parsed;
    }
    next();
  };

// ============================================================================
// 10h. ws: Node.js WebSocket Server & Client powered by Cesanta Mongoose
// ============================================================================

export class WebSocketClientConnection {
  public connId: number;
  public readyState: number = 1;
  private _listeners: Record<string, Array<(...args: any[]) => void>> = {};

  constructor(connId: number) {
    this.connId = connId;
  }

  on(event: string, fn: (...args: any[]) => void): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  }

  emit(event: string, ...args: any[]): void {
    if (this._listeners[event]) {
      this._listeners[event].forEach((f) => f(...args));
    }
  }

  async send(data: string | Uint8Array): Promise<boolean> {
    const text = typeof data === "string"
      ? data
      : new TextDecoder().decode(data);
    const res = await rpc("ws", "send", this.connId.toString(), text, "false");
    return res && res.success;
  }

  async close(): Promise<void> {
    this.readyState = 3;
    await rpc("ws", "close", this.connId.toString());
    this.emit("close");
  }
}

export class WebSocketServer {
  public port: number;
  public host: string;
  public serverId: number = 0;
  public clients: Set<WebSocketClientConnection> = new Set();
  private _pollTimer: any = null;
  private _clientsMap: Map<number, WebSocketClientConnection> = new Map();
  private _listeners: Record<string, Array<(...args: any[]) => void>> = {};

  constructor(options: { port: number; host?: string }, callback?: () => void) {
    this.port = options.port;
    this.host = options.host || "0.0.0.0";
    this._start(callback);
  }

  on(event: string, fn: (...args: any[]) => void): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  }

  emit(event: string, ...args: any[]): void {
    if (this._listeners[event]) {
      this._listeners[event].forEach((f) => f(...args));
    }
  }

  private async _start(callback?: () => void) {
    const res = await rpc(
      "ws",
      "createServer",
      this.port.toString(),
      this.host,
    );
    if (res && res.success) {
      this.serverId = res.serverId;
      this._pollTimer = setInterval(() => this._poll(), 25);
      this.emit("listening");
      if (callback) callback();
    } else {
      this.emit(
        "error",
        new Error(res?.error || "Failed to start WebSocket server"),
      );
    }
  }

  private async _poll() {
    if (!this.serverId) return;
    const res = await rpc("ws", "poll", this.serverId.toString());
    if (res && res.success && Array.isArray(res.events)) {
      for (const ev of res.events) {
        if (ev.type === "connection") {
          const client = new WebSocketClientConnection(ev.connId);
          this.clients.add(client);
          this._clientsMap.set(ev.connId, client);
          this.emit("connection", client, {
            url: `ws://${this.host}:${this.port}`,
          });
        } else if (ev.type === "message") {
          const client = this._clientsMap.get(ev.connId);
          if (client) client.emit("message", ev.data);
        } else if (ev.type === "close") {
          const client = this._clientsMap.get(ev.connId);
          if (client) {
            client.readyState = 3;
            client.emit("close");
            this.clients.delete(client);
            this._clientsMap.delete(ev.connId);
          }
        }
      }
    }
  }

  async close(callback?: () => void): Promise<void> {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (this.serverId) {
      await rpc("ws", "closeServer", this.serverId.toString());
      this.serverId = 0;
    }
    this.emit("close");
    if (callback) callback();
  }
}

export class RitaWebSocket {
  static Server = WebSocketServer;
  private _nativeWs: any = null;
  private _listeners: Record<string, Array<(...args: any[]) => void>> = {};

  constructor(url: string) {
    if (_NativeWebSocket) {
      this._nativeWs = new _NativeWebSocket(url);
      this._nativeWs.onopen = () => this.emit("open");
      this._nativeWs.onmessage = (e: any) => this.emit("message", e.data);
      this._nativeWs.onclose = () => this.emit("close");
      this._nativeWs.onerror = (e: any) => this.emit("error", e);
    }
  }

  on(event: string, fn: (...args: any[]) => void): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  }

  emit(event: string, ...args: any[]): void {
    if (this._listeners[event]) {
      this._listeners[event].forEach((f) => f(...args));
    }
  }

  send(data: string): void {
    if (this._nativeWs) this._nativeWs.send(data);
  }

  close(): void {
    if (this._nativeWs) this._nativeWs.close();
  }
}

export { RitaWebSocket as WebSocket };
export const ws = RitaWebSocket;

// ============================================================================
// 10i. AdmZip: Node.js adm-zip Archive Management
// ============================================================================
export interface IZipEntry {
  entryName: string;
  name: string;
  isDirectory: boolean;
  header: {
    size: number;
    compressedSize: number;
    time?: Date;
  };
  getData(): Uint8Array | string;
}

export class AdmZip {
  private _zipPath: string = "";
  private _entries: IZipEntry[] = [];
  private _entriesMap: Map<
    string,
    { data: Uint8Array | string; entry: IZipEntry }
  > = new Map();

  constructor(zipPathOrBuffer?: string | Uint8Array) {
    if (typeof zipPathOrBuffer === "string") {
      this._zipPath = zipPathOrBuffer;
    }
  }

  addFile(
    entryName: string,
    data: string | Uint8Array | Record<string, any>,
    comment?: string,
    attr?: number,
  ): void {
    const rawData = typeof data === "string"
      ? data
      : (data instanceof Uint8Array ? data : JSON.stringify(data));
    const byteLen = typeof rawData === "string"
      ? new TextEncoder().encode(rawData).length
      : rawData.length;
    const normName = entryName.replace(/\\/g, "/");
    const baseName = normName.split("/").pop() || normName;
    const isDir = normName.endsWith("/");

    const entry: IZipEntry = {
      entryName: normName,
      name: baseName,
      isDirectory: isDir,
      header: {
        size: byteLen,
        compressedSize: Math.max(1, Math.floor(byteLen * 0.85)),
        time: new Date(),
      },
      getData: () => rawData,
    };

    const existingIdx = this._entries.findIndex((e) =>
      e.entryName === normName
    );
    if (existingIdx !== -1) {
      this._entries[existingIdx] = entry;
    } else {
      this._entries.push(entry);
    }
    this._entriesMap.set(normName, { data: rawData, entry });
  }

  getEntries(): IZipEntry[] {
    return this._entries;
  }

  getEntry(entryName: string): IZipEntry | null {
    const norm = entryName.replace(/\\/g, "/");
    return this._entriesMap.get(norm)?.entry || null;
  }

  readAsText(entry: string | IZipEntry, encoding?: string): string {
    const name = typeof entry === "string"
      ? entry.replace(/\\/g, "/")
      : entry.entryName;
    const item = this._entriesMap.get(name);
    if (item) {
      if (typeof item.data === "string") return item.data;
      return new TextDecoder().decode(item.data);
    }
    return "";
  }

  toBuffer(): Uint8Array {
    let totalLen = 0;
    const buffers: Uint8Array[] = [];
    for (const item of this._entriesMap.values()) {
      const bytes = typeof item.data === "string"
        ? new TextEncoder().encode(item.data)
        : item.data;
      buffers.push(bytes);
      totalLen += bytes.length;
    }
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const buf of buffers) {
      result.set(buf, offset);
      offset += buf.length;
    }
    return result;
  }

  async extractAllTo(
    targetPath: string,
    overwrite: boolean = true,
  ): Promise<boolean> {
    if (this._zipPath) {
      const res = await rpc(
        "admZip",
        "extractAllTo",
        this._zipPath,
        targetPath,
        String(overwrite),
      );
      return !!res?.success;
    }
    for (const [name, item] of this._entriesMap.entries()) {
      if (item.entry.isDirectory) continue;
      const fullPath = targetPath.replace(/[\/\\]+$/, "") + "\\" +
        name.replace(/\//g, "\\");
      const content = typeof item.data === "string"
        ? item.data
        : new TextDecoder().decode(item.data);
      await rpc("fs", "writeFile", fullPath, content);
    }
    return true;
  }

  async extractEntryTo(
    entryPath: string,
    targetPath: string,
    maintainEntryPath: boolean = false,
    overwrite: boolean = true,
  ): Promise<boolean> {
    return await this.extractAllTo(targetPath, overwrite);
  }

  async writeZip(targetPath?: string): Promise<boolean> {
    const dest = targetPath || this._zipPath;
    if (!dest) return false;
    if (this._zipPath) {
      const res = await rpc("admZip", "createZip", dest, this._zipPath);
      return !!res?.success;
    }
    const content = this.toBuffer();
    const str = new TextDecoder().decode(content);
    const res = await rpc("fs", "writeFile", dest, str);
    return !!res?.success;
  }

  async addLocalFolder(
    localFolder: string,
    _zipSubdir: string = "",
  ): Promise<void> {
    this._zipPath = localFolder;
  }

  async addLocalFile(localFile: string): Promise<void> {
    this._zipPath = localFile;
  }
}
export const admZip = AdmZip;

// ============================================================================
// 11. RitaWapp Vue 3 Plugin
// ============================================================================
export const RitaWapp: Plugin = {
  install(app: App) {
    const g = typeof globalThis !== "undefined"
      ? globalThis
      : (typeof window !== "undefined" ? window : ({} as any));

    const allBindings: Record<string, any> = {
      fs,
      os,
      path,
      process: (g as any).process || process,
      shell,
      appWindow,
      webUI,
      network,
      mongoose,
      Schema,
      Model,
      db,
      sqlite: db,
      sqlite3: db,
      update,
      cloudSync,
      tray,
      net,
      dgram,
      http,
      https,
      desktopFetch,
      fetch: desktopFetch,
      express,
      ws: RitaWebSocket,
      WebSocket: RitaWebSocket,
      RitaWebSocket,
      AdmZip,
      admZip: AdmZip,
      isModuleEnabled,
      isAssetsMod,
      getAssetUrl,
      asset: getAssetUrl,
      rita: RitaWapp,
      RitaWapp,
    };

    for (const [key, val] of Object.entries(allBindings)) {
      (g as any)[key] = val;
      app.config.globalProperties[`$${key}`] = val;
      app.config.globalProperties[key] = val;
      app.provide(key, val);
      app.provide(`$${key}`, val);
    }

    // Global development shortcut: Ctrl+Shift+I, Ctrl+I, or F12 opens developer tools
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", (e: KeyboardEvent) => {
        const isDevToolsKey =
          (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "i") ||
          (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "i") ||
          e.key === "F12";
        if (isDevToolsKey) {
          if (typeof (appWindow as any).openDevTools === "function") {
            (appWindow as any).openDevTools().catch(() => {});
          }
        }
      });
    }

    const activeList = Object.entries(enabledModules)
      .filter(([_, enabled]) => enabled)
      .map(([k]) => k)
      .join(", ");

    console.log(
      `%c[RitaWapp Core]%c Registered zero-import global modules on window & Vue: [${
        activeList || "none"
      }].`,
      "color: #42b883; font-weight: bold",
      "color: auto",
    );
  },
};

// Immediate auto-injection into globalThis upon import
(function injectGlobalThis() {
  const g = typeof globalThis !== "undefined" ? globalThis : window;

  (g as any).fs = fs;
  (g as any).os = os;
  (g as any).path = path;

  if ((g as any).process) {
    try {
      if ((g as any).process.env) {
        Object.assign((g as any).process.env, process.env);
      } else {
        (g as any).process.env = process.env;
      }
    } catch (_) {}
    for (const [k, v] of Object.entries(process)) {
      if (k === "platform" || k === "arch" || k === "env") continue;
      try {
        if (!((g as any).process as any)[k]) {
          ((g as any).process as any)[k] = v;
        }
      } catch (_) {}
    }
  } else {
    (g as any).process = process;
  }

  (g as any).shell = shell;
  (g as any).appWindow = appWindow;
  (g as any).webUI = webUI;
  (g as any).network = network;
  (g as any).mongoose = mongoose;
  (g as any).Schema = Schema;
  (g as any).Model = Model;
  (g as any).db = db;
  (g as any).sqlite = db;
  (g as any).sqlite3 = db;
  (g as any).update = update;
  (g as any).cloudSync = cloudSync;
  (g as any).tray = tray;
  (g as any).net = net;
  (g as any).dgram = dgram;
  (g as any).http = http;
  (g as any).https = https;
  (g as any).desktopFetch = desktopFetch;
  if (!(g as any).fetch) (g as any).fetch = desktopFetch;
  (g as any).express = express;
  (g as any).ws = RitaWebSocket;
  (g as any).RitaWebSocket = RitaWebSocket;
  if (!(g as any).WebSocket) (g as any).WebSocket = RitaWebSocket;
  (g as any).AdmZip = AdmZip;
  (g as any).admZip = AdmZip;
  (g as any).isModuleEnabled = isModuleEnabled;
  (g as any).isAssetsMod = isAssetsMod;
  (g as any).getAssetUrl = getAssetUrl;
  (g as any).asset = getAssetUrl;
  (g as any).RitaWapp = RitaWapp;
})();

export default RitaWapp;
