/**
 * ============================================================================
 * RDevCore/client/vue/RitaWapp.ts
 * ============================================================================
 * RitaWapp Production Vue 3 Plugin & Global Module Injector
 *
 * Automatically injects Node.js-compatible native APIs into globalThis:
 * - globalThis.fs          (Node.js 'fs' module)
 * - globalThis.os          (Node.js 'os' module)
 * - globalThis.path        (Node.js 'path' module)
 * - globalThis.process     (Node.js 'process' module)
 * - globalThis.shell       (Native command runner & ShellExecute)
 * - globalThis.appWindow   (Native window controls, frameless, resizing, center)
 * - globalThis.webUI       (Alias to appWindow)
 * - globalThis.network     (Wi-Fi, interfaces & network connectivity)
 * - globalThis.mongoose    (MongoDB Mongoose ODM interface for Real SQLite)
 * - globalThis.db          (Universal Database: Mongoose ODM + Direct High-Speed SQL)
 * - globalThis.sqlite      (Alias to db)
 * - globalThis.sqlite3     (Alias to db)
 * - globalThis.update      (GitHub release auto-updater)
 * - globalThis.cloudSync   (Cross-device cloud synchronization)
 * - globalThis.tray        (Windows System Tray icon & context menu)
 * - globalThis.net         (Node.js 'net' TCP client & server)
 * - globalThis.dgram       (Node.js 'dgram' UDP sockets)
 * - globalThis.http        (Node.js 'http' client & real server via Cesanta Mongoose)
 * - globalThis.https       (Node.js 'https' client & real server via Cesanta Mongoose)
 * - globalThis.fetch       (CORS-free Desktop Fetch API)
 * - globalThis.express     (Full Express.js engine via Cesanta Mongoose)
 * - globalThis.ws          (Node.js 'ws' WebSocket server & client via Cesanta Mongoose)
 * - globalThis.WebSocket   (WebSocket client & server constructor)
 * - globalThis.AdmZip      (Node.js 'adm-zip' compression & archive management)
 * ============================================================================
 */

export interface VueAppLike {
  config: {
    globalProperties: Record<string, any>;
  };
  provide(key: string | symbol, value: any): this;
}

export interface VuePluginLike {
  install(app: VueAppLike, ...options: any[]): void;
}

// Re-export all integrated modules
export { default as fsDefault, fs } from "../../modules/integrated/fs/fs.ts";
export { default as osDefault, os } from "../../modules/integrated/os/os.ts";
export {
  default as pathDefault,
  path,
} from "../../modules/integrated/path/path.ts";
export {
  default as processDefault,
  process,
} from "../../modules/integrated/process/process.ts";
export {
  default as shellDefault,
  shell,
} from "../../modules/integrated/shell/shell.ts";
export {
  appWindow,
  default as appWindowDefault,
  webUI,
} from "../../modules/integrated/appWindow/appWindow.ts";
export {
  default as networkDefault,
  network,
} from "../../modules/integrated/network/network.ts";
export {
  db,
  default as mongooseDefault,
  Model,
  mongoose,
  Schema,
  sqlite,
  sqlite3,
} from "../../modules/integrated/database/mongoose.ts";
export {
  default as updateDefault,
  update,
} from "../../modules/integrated/update/update.ts";
export {
  cloudSync,
  default as cloudSyncDefault,
} from "../../modules/integrated/cloudSync/cloudSync.ts";
export {
  default as trayDefault,
  tray,
} from "../../modules/integrated/tray/tray.ts";
export {
  default as netDefault,
  net,
} from "../../modules/integrated/net/net.ts";
export {
  default as dgramDefault,
  dgram,
} from "../../modules/integrated/dgram/dgram.ts";
export {
  createServer,
  default as httpDefault,
  http,
  HttpServer,
} from "../../modules/integrated/http/http.ts";
export {
  default as httpsDefault,
  https,
} from "../../modules/integrated/http/https.ts";
export {
  default as fetchDefault,
  fetch,
} from "../../modules/integrated/fetch/fetch.ts";
export {
  Application,
  default as expressDefault,
  express,
  Request,
  Response,
  Router,
} from "../../modules/integrated/express/express.ts";
export {
  default as wsDefault,
  WebSocket,
  WebSocketServer,
  ws,
} from "../../modules/integrated/ws/ws.ts";
export {
  AdmZip,
  default as admZipDefault,
} from "../../modules/integrated/admZip/adm-zip.ts";
export const admZip = AdmZip;
export {
  enabledModules,
  isAssetsMod,
  isModuleEnabled,
} from "./ritawapp.modules.ts";

import {
  enabledModules,
  isAssetsMod,
  isModuleEnabled,
} from "./ritawapp.modules.ts";

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
import { fs } from "../../modules/integrated/fs/fs.ts";
import { os } from "../../modules/integrated/os/os.ts";
import { path } from "../../modules/integrated/path/path.ts";
import { process } from "../../modules/integrated/process/process.ts";
import { shell } from "../../modules/integrated/shell/shell.ts";
import {
  appWindow,
  webUI,
} from "../../modules/integrated/appWindow/appWindow.ts";
import { network } from "../../modules/integrated/network/network.ts";
import {
  db,
  mongoose,
  sqlite,
  sqlite3,
} from "../../modules/integrated/database/mongoose.ts";
import { update } from "../../modules/integrated/update/update.ts";
import { cloudSync } from "../../modules/integrated/cloudSync/cloudSync.ts";
import { tray } from "../../modules/integrated/tray/tray.ts";
import { net } from "../../modules/integrated/net/net.ts";
import { dgram } from "../../modules/integrated/dgram/dgram.ts";
import { http } from "../../modules/integrated/http/http.ts";
import { https } from "../../modules/integrated/http/https.ts";
import { fetch } from "../../modules/integrated/fetch/fetch.ts";
import { express } from "../../modules/integrated/express/express.ts";
import { WebSocket, ws } from "../../modules/integrated/ws/ws.ts";
import { AdmZip } from "../../modules/integrated/admZip/adm-zip.ts";

/**
 * RitaWapp Vue 3 Plugin
 */
export const RitaWapp: VuePluginLike = {
  install(app: VueAppLike) {
    const g = typeof globalThis !== "undefined" ? globalThis : window;

    if (isModuleEnabled("fs")) {
      (g as any).fs = fs;
      app.config.globalProperties.$fs = fs;
      app.provide("fs", fs);
    }
    if (isModuleEnabled("os")) {
      (g as any).os = os;
      app.config.globalProperties.$os = os;
      app.provide("os", os);
    }
    if (isModuleEnabled("path")) {
      (g as any).path = path;
      app.config.globalProperties.$path = path;
      app.provide("path", path);
    }
    if (isModuleEnabled("process")) {
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
      app.config.globalProperties.$process = process;
      app.provide("process", process);
    }
    if (isModuleEnabled("shell")) {
      (g as any).shell = shell;
      app.config.globalProperties.$shell = shell;
      app.provide("shell", shell);
    }
    if (isModuleEnabled("appWindow")) {
      (g as any).appWindow = appWindow;
      (g as any).webUI = webUI;
      app.config.globalProperties.$appWindow = appWindow;
      app.config.globalProperties.$webUI = webUI;
      app.provide("appWindow", appWindow);
      app.provide("webUI", webUI);
    }
    if (isModuleEnabled("network")) {
      (g as any).network = network;
      app.config.globalProperties.$network = network;
      app.provide("network", network);
    }
    if (isModuleEnabled("database")) {
      (g as any).mongoose = mongoose;
      (g as any).db = db;
      (g as any).sqlite = sqlite;
      (g as any).sqlite3 = sqlite3;
      app.config.globalProperties.$mongoose = mongoose;
      app.config.globalProperties.$db = db;
      app.config.globalProperties.$sqlite = sqlite;
      app.config.globalProperties.$sqlite3 = sqlite3;
      app.provide("mongoose", mongoose);
      app.provide("db", db);
      app.provide("sqlite", sqlite);
      app.provide("sqlite3", sqlite3);
    }
    if (isModuleEnabled("update")) {
      (g as any).update = update;
      app.config.globalProperties.$update = update;
      app.provide("update", update);
    }
    if (isModuleEnabled("cloudSync")) {
      (g as any).cloudSync = cloudSync;
      app.config.globalProperties.$cloudSync = cloudSync;
      app.provide("cloudSync", cloudSync);
    }
    if (isModuleEnabled("tray")) {
      (g as any).tray = tray;
      app.config.globalProperties.$tray = tray;
      app.provide("tray", tray);
    }
    if (isModuleEnabled("net")) {
      (g as any).net = net;
      app.config.globalProperties.$net = net;
      app.provide("net", net);
    }
    if (isModuleEnabled("dgram")) {
      (g as any).dgram = dgram;
      app.config.globalProperties.$dgram = dgram;
      app.provide("dgram", dgram);
    }
    if (isModuleEnabled("http")) {
      (g as any).http = http;
      app.config.globalProperties.$http = http;
      app.provide("http", http);
    }
    if (isModuleEnabled("https")) {
      (g as any).https = https;
      app.config.globalProperties.$https = https;
      app.provide("https", https);
    }
    if (isModuleEnabled("fetch")) {
      (g as any).desktopFetch = fetch;
      if (!(g as any).fetch) (g as any).fetch = fetch;
      app.config.globalProperties.$fetch = fetch;
      app.config.globalProperties.$desktopFetch = fetch;
      app.provide("fetch", fetch);
      app.provide("desktopFetch", fetch);
    }
    if (isModuleEnabled("express")) {
      (g as any).express = express;
      app.config.globalProperties.$express = express;
      app.provide("express", express);
    }
    if (isModuleEnabled("ws")) {
      (g as any).ws = ws;
      (g as any).RitaWebSocket = WebSocket;
      if (!(g as any).WebSocket) (g as any).WebSocket = WebSocket;
      app.config.globalProperties.$ws = ws;
      app.config.globalProperties.$WebSocket = WebSocket;
      app.config.globalProperties.$RitaWebSocket = WebSocket;
      app.provide("ws", ws);
      app.provide("WebSocket", WebSocket);
      app.provide("RitaWebSocket", WebSocket);
    }
    if (isModuleEnabled("admZip")) {
      (g as any).AdmZip = AdmZip;
      (g as any).admZip = AdmZip;
      app.config.globalProperties.$AdmZip = AdmZip;
      app.config.globalProperties.$admZip = AdmZip;
      app.provide("AdmZip", AdmZip);
      app.provide("admZip", AdmZip);
    }

    (g as any).RitaWapp = RitaWapp;
    (g as any).isAssetsMod = isAssetsMod;
    (g as any).getAssetUrl = getAssetUrl;
    app.config.globalProperties.$rita = RitaWapp;
    app.config.globalProperties.$isAssetsMod = isAssetsMod;
    app.config.globalProperties.$getAssetUrl = getAssetUrl;
    app.config.globalProperties.$asset = getAssetUrl;
    app.provide("RitaWapp", RitaWapp);
    app.provide("isAssetsMod", isAssetsMod);
    app.provide("getAssetUrl", getAssetUrl);

    const activeList = Object.entries(enabledModules)
      .filter(([_, enabled]) => enabled)
      .map(([k]) => k)
      .join(", ");

    console.log(
      `%c[RitaWapp Core]%c Injected active native modules into globalThis and Vue instance: [${
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

  if (isModuleEnabled("fs")) (g as any).fs = fs;
  if (isModuleEnabled("os")) (g as any).os = os;
  if (isModuleEnabled("path")) (g as any).path = path;

  if (isModuleEnabled("process")) {
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
  }

  if (isModuleEnabled("shell")) (g as any).shell = shell;

  if (isModuleEnabled("appWindow")) {
    (g as any).appWindow = appWindow;
    (g as any).webUI = webUI;
  }

  if (isModuleEnabled("network")) (g as any).network = network;

  if (isModuleEnabled("database")) {
    (g as any).mongoose = mongoose;
    (g as any).db = db;
    (g as any).sqlite = sqlite;
    (g as any).sqlite3 = sqlite3;
  }

  if (isModuleEnabled("update")) (g as any).update = update;
  if (isModuleEnabled("cloudSync")) (g as any).cloudSync = cloudSync;
  if (isModuleEnabled("tray")) (g as any).tray = tray;
  if (isModuleEnabled("net")) (g as any).net = net;
  if (isModuleEnabled("dgram")) (g as any).dgram = dgram;
  if (isModuleEnabled("http")) (g as any).http = http;
  if (isModuleEnabled("https")) (g as any).https = https;

  if (isModuleEnabled("fetch")) {
    (g as any).desktopFetch = fetch;
    if (!(g as any).fetch) (g as any).fetch = fetch;
  }

  if (isModuleEnabled("express")) (g as any).express = express;

  if (isModuleEnabled("ws")) {
    (g as any).ws = ws;
    (g as any).RitaWebSocket = WebSocket;
    if (!(g as any).WebSocket) (g as any).WebSocket = WebSocket;
  }

  if (isModuleEnabled("admZip")) {
    (g as any).AdmZip = AdmZip;
    (g as any).admZip = AdmZip;
  }

  (g as any).RitaWapp = RitaWapp;

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
})();

export default RitaWapp;
