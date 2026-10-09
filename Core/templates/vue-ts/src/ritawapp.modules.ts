/**
 * ============================================================================
 * RitaWapp Active Modules Manifest
 * ============================================================================
 * Synchronized automatically from RitaWapp-config.ts by build/dev server.
 * Defines which native integrated modules are compiled and active.
 * ============================================================================
 */

export const isAssetsMod: boolean = false;

export const enabledModules: Record<string, boolean> = {
  appWindow: true,
  database: true,
  fs: true,
  os: true,
  path: true,
  process: true,
  shell: true,
  network: true,
  update: true,
  cloudSync: true,
  tray: true,
  net: true,
  dgram: true,
  http: true,
  https: true,
  fetch: true,
  express: true,
  ws: true,
  admZip: true,
  "mongoose-sqlite": true,
};

export function isModuleEnabled(name: string): boolean {
  if (!name) return false;
  const norm = name.toLowerCase();
  if (
    norm === "webui" || norm === "windowsapi" || norm === "window" ||
    norm === "appwindow"
  ) return !!enabledModules.appWindow;
  if (
    norm === "db" || norm === "sqlite" || norm === "sqlite3" ||
    norm === "mongoose" || norm === "database" ||
    norm === "mongoose-sqlite" || norm === "mongoosesqlite"
  ) return !!enabledModules.database || !!enabledModules["mongoose-sqlite"];
  if (norm === "desktopfetch") return !!enabledModules.fetch;
  if (norm === "websocket" || norm === "ritawebsocket") {
    return !!enabledModules.ws;
  }
  if (norm === "adm-zip") return !!enabledModules.admZip;
  if (norm === "cloud" || norm === "sync") return !!enabledModules.cloudSync;
  return !!enabledModules[name];
}

export default enabledModules;
