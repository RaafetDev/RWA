/**
 * RitaWapp Integrated Module Registry
 * Source of truth for all integrated native + TS modules.
 */

import type { ModuleName } from "../../config/config.ts";

export interface ModuleManifest {
  name: ModuleName;
  version: string;
  description: string;
  requiresMongoose: boolean;
  requiresSqlite: boolean;
  dependencies: ModuleName[];
  actions: string[];
}

export const INTEGRATED_MODULES: Record<ModuleName, ModuleManifest> = {
  fs: {
    name: "fs",
    version: "1.0.1",
    description:
      "File system operations with path traversal sanitization and confinement.",
    requiresMongoose: false,
    requiresSqlite: false,
    dependencies: [],
    actions: [
      "readFile",
      "writeFile",
      "appendFile",
      "exists",
      "readdir",
      "mkdir",
      "unlink",
      "copyFile",
      "stat",
      "getAppDir",
      "getAssetsDir",
    ],
  },
  os: {
    name: "os",
    version: "1.0.1",
    description:
      "Operating system information, hardware identification, and machine fingerprinting.",
    requiresMongoose: false,
    requiresSqlite: false,
    dependencies: [],
    actions: [
      "platform",
      "arch",
      "release",
      "hostname",
      "homedir",
      "tmpdir",
      "totalmem",
      "freemem",
      "uptime",
      "getMetrics",
      "fingerprint",
      "getInfo",
    ],
  },
  path: {
    name: "path",
    version: "1.0.1",
    description:
      "Pure TypeScript path manipulation (win32 and posix compliant).",
    requiresMongoose: false,
    requiresSqlite: false,
    dependencies: [],
    actions: [
      "join",
      "resolve",
      "normalize",
      "basename",
      "dirname",
      "extname",
      "isAbsolute",
      "parse",
      "relative",
    ],
  },
  process: {
    name: "process",
    version: "1.0.1",
    description:
      "Runtime process details, environment access, and process lifetime controls.",
    requiresMongoose: false,
    requiresSqlite: false,
    dependencies: [],
    actions: ["cwd", "getEnv", "memoryUsage", "uptime", "pid", "exit"],
  },
  shell: {
    name: "shell",
    version: "1.0.1",
    description:
      "Privileged command execution, external URL opener, and explorer display.",
    requiresMongoose: false,
    requiresSqlite: false,
    dependencies: [],
    actions: ["exec", "openExternal", "showItemInFolder"],
  },
  appWindow: {
    name: "appWindow",
    version: "1.0.1",
    description:
      "Window sizing, position, frameless/transparency styling, and DWM controls.",
    requiresMongoose: false,
    requiresSqlite: false,
    dependencies: [],
    actions: [
      "isFrameless",
      "minimize",
      "maximize",
      "restore",
      "close",
      "isMaximized",
      "drag",
      "setSize",
      "getSize",
      "setPosition",
      "getPosition",
      "center",
      "setAlwaysOnTop",
      "showMessageBox",
      "reload",
      "navigate",
    ],
  },
  network: {
    name: "network",
    version: "1.0.1",
    description:
      "Network interface discovery, Wi-Fi management, and latency ping.",
    requiresMongoose: false,
    requiresSqlite: false,
    dependencies: [],
    actions: [
      "isOnline",
      "ping",
      "getInterfaces",
      "scanWifi",
      "connectWifi",
      "disconnectWifi",
    ],
  },
  database: {
    name: "database",
    version: "1.0.1",
    description:
      "Embedded SQLite 3 with WAL, direct SQL, Mongoose-like ODM, and vector search.",
    requiresMongoose: false,
    requiresSqlite: true,
    dependencies: [],
    actions: [
      "exec",
      "run",
      "query",
      "get",
      "transaction",
      "stream",
      "model",
      "autoIndex",
      "search",
      "storeVector",
      "searchVector",
      "optimize",
    ],
  },
  update: {
    name: "update",
    version: "1.0.1",
    description:
      "GitHub Releases update checking with SHA-256 verification and rollback.",
    requiresMongoose: true,
    requiresSqlite: false,
    dependencies: ["http"],
    actions: [
      "getCurrentVersion",
      "getRepoUrl",
      "checkForUpdates",
      "downloadAndInstall",
      "rollback",
    ],
  },
  cloudSync: {
    name: "cloudSync",
    version: "1.0.1",
    description:
      "Device-to-device database sync over HTTPS with change tracking and tombstoning.",
    requiresMongoose: true,
    requiresSqlite: true,
    dependencies: ["http", "database"],
    actions: ["connect", "getStatus", "sync"],
  },
  tray: {
    name: "tray",
    version: "1.0.1",
    description:
      "Native Win32 system tray icon, context menu pump, and minimize-to-tray handling.",
    requiresMongoose: false,
    requiresSqlite: false,
    dependencies: [],
    actions: ["set", "items", "appShow", "appHide", "setTooltip"],
  },
  net: {
    name: "net",
    version: "1.0.1",
    description:
      "Winsock2 TCP server and client implementation mimicking Node.js net.",
    requiresMongoose: false,
    requiresSqlite: false,
    dependencies: [],
    actions: ["createServer", "connect", "isIP", "isIPv4", "isIPv6"],
  },
  dgram: {
    name: "dgram",
    version: "1.0.1",
    description:
      "Winsock2 UDP socket implementation for datagram communications.",
    requiresMongoose: false,
    requiresSqlite: false,
    dependencies: [],
    actions: ["createSocket", "bind", "send"],
  },
  http: {
    name: "http",
    version: "1.0.1",
    description:
      "Mongoose-backed HTTP/HTTPS server and client with verified TLS.",
    requiresMongoose: true,
    requiresSqlite: false,
    dependencies: [],
    actions: ["createServer", "request", "get"],
  },
  fetch: {
    name: "fetch",
    version: "1.0.1",
    description:
      "WHATWG-compliant fetch engine running over Cesanta Mongoose net.",
    requiresMongoose: true,
    requiresSqlite: false,
    dependencies: ["http"],
    actions: ["fetch"],
  },
  express: {
    name: "express",
    version: "1.0.1",
    description:
      "Express-style routing, middleware, body parsing, and response handlers.",
    requiresMongoose: true,
    requiresSqlite: false,
    dependencies: ["http"],
    actions: ["use", "get", "post", "put", "patch", "delete", "all", "listen"],
  },
  admZip: {
    name: "admZip",
    version: "1.0.1",
    description:
      "ZIP archive decompression and creation with strict Zip-Slip protection.",
    requiresMongoose: false,
    requiresSqlite: false,
    dependencies: [],
    actions: [
      "addFile",
      "addLocalFile",
      "getEntries",
      "readAsText",
      "readFile",
      "extractAllTo",
      "extractEntryTo",
      "writeZip",
    ],
  },
  ws: {
    name: "ws",
    version: "1.0.1",
    description: "Cesanta Mongoose-backed WebSocket server and client.",
    requiresMongoose: true,
    requiresSqlite: false,
    dependencies: [],
    actions: ["createServer", "connect", "send", "broadcast", "close"],
  },
  "mongoose-sqlite": {
    name: "mongoose-sqlite",
    version: "1.0.1",
    description:
      "Node.js Mongoose ODM port for SQLite (Schema, Model, validation, query builder, timestamps, and indexes).",
    requiresMongoose: false,
    requiresSqlite: true,
    dependencies: ["database"],
    actions: [
      "find",
      "findOne",
      "findById",
      "create",
      "insertMany",
      "updateOne",
      "updateMany",
      "deleteOne",
      "deleteMany",
      "countDocuments",
      "distinct",
      "paginate",
      "stream",
      "autoIndex",
      "drop",
    ],
  },
};

/**
 * Returns list of all 18 module names.
 */
export function getAllModuleNames(): ModuleName[] {
  return Object.keys(INTEGRATED_MODULES) as ModuleName[];
}

/**
 * Resolves full list of enabled modules, accounting for presets and dependency edges.
 */
export function resolveEnabledModules(
  selection:
    | "all"
    | "minimal"
    | ModuleName[]
    | Partial<Record<ModuleName, boolean>>,
): {
  enabled: ModuleName[];
  requiresMongoose: boolean;
  requiresSqlite: boolean;
} {
  const enabledSet = new Set<ModuleName>();

  if (selection === "all") {
    for (const name of getAllModuleNames()) {
      enabledSet.add(name);
    }
  } else if (selection === "minimal") {
    enabledSet.add("appWindow");
    enabledSet.add("database");
  } else if (Array.isArray(selection)) {
    for (const name of selection) {
      if (name in INTEGRATED_MODULES) {
        enabledSet.add(name);
      }
    }
  } else if (typeof selection === "object" && selection !== null) {
    for (const [key, val] of Object.entries(selection)) {
      if (val && (key in INTEGRATED_MODULES)) {
        enabledSet.add(key as ModuleName);
      }
    }
  }

  // Resolve dependency edges automatically
  let changed = true;
  while (changed) {
    changed = false;
    for (const name of Array.from(enabledSet)) {
      const manifest = INTEGRATED_MODULES[name];
      if (manifest) {
        for (const dep of manifest.dependencies) {
          if (!enabledSet.has(dep)) {
            enabledSet.add(dep);
            changed = true;
          }
        }
      }
    }
  }

  let requiresMongoose = false;
  let requiresSqlite = false;

  for (const name of enabledSet) {
    const manifest = INTEGRATED_MODULES[name];
    if (manifest?.requiresMongoose) requiresMongoose = true;
    if (manifest?.requiresSqlite) requiresSqlite = true;
  }

  return {
    enabled: Array.from(enabledSet),
    requiresMongoose,
    requiresSqlite,
  };
}
