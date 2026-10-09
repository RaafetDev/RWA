/**
 * RitaWapp Configuration Interface & Validator
 * Strict typing and backwards-compatibility resolution for RitaWapp apps.
 */

export type ModuleName =
  | "fs"
  | "os"
  | "path"
  | "process"
  | "shell"
  | "appWindow"
  | "network"
  | "database"
  | "update"
  | "cloudSync"
  | "tray"
  | "net"
  | "dgram"
  | "http"
  | "fetch"
  | "express"
  | "admZip"
  | "ws"
  | "mongoose-sqlite";

export interface TrayItem {
  id?: string;
  name: string;
  action?: string | (() => void);
  type?: "normal" | "separator" | "-";
  enabled?: boolean;
}

export interface RitaWappConfig {
  app: {
    name: string;
    displayName: string;
    version: string;
    appId: string;
    description: string;
    appIcon: string;
  };
  repoUrl?: string;
  window: {
    title: string;
    width: number;
    height: number;
    minWidth?: number;
    minHeight?: number;
    resizable?: boolean;
    frameless?: boolean;
    transparent?: boolean;
    center?: boolean;
  };
  installer: {
    title: string;
    subtitle: string;
    width: number;
    height: number;
    backgroundColor: string;
    accentColor: string;
    textColor: string;
    accentHeight: number;
  };
  tray: {
    enable: boolean;
    tooltip: string;
    icon: string;
    hideToTrayOnMinimize: boolean;
    items: TrayItem[];
  };
  modules:
    | "all"
    | "minimal"
    | ModuleName[]
    | Partial<Record<ModuleName, boolean>>;
  assetsMod?: boolean;
  assetsMode?: boolean; // deprecated alias
  trayEnable?: boolean; // deprecated alias
  trayEnabel?: boolean; // deprecated alias
  devtools?: {
    openOnStart?: boolean;
  };
  security: {
    aesKey?: string;
    cipher: "AES-256-GCM";
  };
  compiler: {
    appBrowserMode:
      | "all"
      | "chrome"
      | "edge"
      | "safari"
      | "opera"
      | "webview2"
      | "webview2AutoInstall";
    gccPath: string;
    optimization: "-Os" | "-O2" | "-O3";
    extraFlags: string[];
  };
}

export const DEFAULT_CONFIG: RitaWappConfig = {
  app: {
    name: "RitaWappApp",
    displayName: "RitaWapp Application",
    version: "1.0.1",
    appId: "com.ritawapp.app",
    description: "Built with RitaWapp Framework",
    appIcon: "app.ico",
  },
  window: {
    title: "RitaWapp Application",
    width: 1024,
    height: 720,
    minWidth: 400,
    minHeight: 300,
    resizable: true,
    frameless: false,
    transparent: false,
    center: true,
  },
  installer: {
    title: "Setting up runtime",
    subtitle: "Installing Microsoft WebView2 components...",
    width: 480,
    height: 220,
    backgroundColor: "#1e1e24",
    accentColor: "#3b82f6",
    textColor: "#f3f4f6",
    accentHeight: 4,
  },
  tray: {
    enable: false,
    tooltip: "RitaWapp Application",
    icon: "app.ico",
    hideToTrayOnMinimize: false,
    items: [],
  },
  modules: "minimal",
  assetsMod: false,
  security: {
    cipher: "AES-256-GCM",
  },
  compiler: {
    appBrowserMode: "webview2AutoInstall",
    gccPath: "gcc",
    optimization: "-Os",
    extraFlags: [],
  },
};

/**
 * Validates and normalizes user configuration.
 */
export function validateConfig(raw: unknown): RitaWappConfig {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Configuration must be a valid object");
  }

  const input = raw as Partial<RitaWappConfig>;

  // Resolve tray aliases
  const trayEnabled = input.tray?.enable ?? input.trayEnable ??
    input.trayEnabel ?? DEFAULT_CONFIG.tray.enable;

  // Resolve assetsMod alias
  const assetsMod = input.assetsMod ?? input.assetsMode ??
    DEFAULT_CONFIG.assetsMod;

  const app = {
    ...DEFAULT_CONFIG.app,
    ...(input.app || {}),
  };

  if (!app.name || !/^[a-zA-Z0-9_\-]+$/.test(app.name)) {
    throw new Error(
      "Invalid app.name: must contain only alphanumeric characters, dashes, or underscores.",
    );
  }

  const windowCfg = {
    ...DEFAULT_CONFIG.window,
    ...(input.window || {}),
  };

  const installerCfg = {
    ...DEFAULT_CONFIG.installer,
    ...(input.installer || {}),
  };

  const trayCfg = {
    ...DEFAULT_CONFIG.tray,
    ...(input.tray || {}),
    enable: trayEnabled,
  };

  const security = {
    ...DEFAULT_CONFIG.security,
    ...(input.security || {}),
  };

  if (
    security.aesKey &&
    (security.aesKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(security.aesKey))
  ) {
    throw new Error(
      "security.aesKey must be a 64-character hexadecimal string (256-bit key).",
    );
  }

  const compiler = {
    ...DEFAULT_CONFIG.compiler,
    ...(input.compiler || {}),
  };

  return {
    app,
    repoUrl: input.repoUrl,
    window: windowCfg,
    installer: installerCfg,
    tray: trayCfg,
    modules: input.modules ?? DEFAULT_CONFIG.modules,
    assetsMod,
    devtools: input.devtools,
    security,
    compiler,
  };
}

/**
 * Loads configuration file with JSON and TypeScript support.
 */
export async function loadConfigFile(
  projectDir: string = Deno.cwd(),
): Promise<RitaWappConfig> {
  const candidates = [
    `${projectDir}/RitaWapp.json`,
    `${projectDir}/ritawapp.json`,
    `${projectDir}/RitaWapp.config.ts`,
    `${projectDir}/RitaWapp-config.ts`,
    `${projectDir}/ritawapp.config.ts`,
  ];

  for (const path of candidates) {
    try {
      const stat = await Deno.stat(path);
      if (stat.isFile) {
        if (path.endsWith(".json")) {
          const raw = await Deno.readTextFile(path);
          const parsed = JSON.parse(raw);
          return validateConfig(parsed);
        }

        const fileUrl = path.startsWith("file:")
          ? path
          : `file:///${path.replaceAll("\\", "/")}`;
        const imported = await import(`${fileUrl}?t=${Date.now()}`);
        const config = imported.default || imported.config;
        if (!config) {
          throw new Error(
            `Config file at ${path} did not export default or config.`,
          );
        }
        return validateConfig(config);
      }
    } catch (e: unknown) {
      if (!(e instanceof Deno.errors.NotFound)) {
        throw e;
      }
    }
  }

  return DEFAULT_CONFIG;
}
