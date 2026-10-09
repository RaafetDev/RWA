/**
 * ============================================================================
 * Core/cli/init.ts
 * ============================================================================
 * RitaWapp Interactive Project Initialization Wizard
 * Pure Deno + JSR Cliffy Prompts.
 * Creates clean consumer projects containing ONLY template files,
 * RPC bridge, and RitaWapp.json configuration.
 * ============================================================================
 */

import { Checkbox, Input, Select } from "jsr:@cliffy/prompt@1.0.0-rc.7";
import { basename, join, resolve } from "jsr:@std/path@1.0.9";
import { getFrameworkRoot } from "../toolchain/paths.ts";
import { logger } from "./logger.ts";
import { RitaError } from "./errors.ts";
import type { ModuleName, RitaWappConfig } from "../config/config.ts";

const ALL_MODULES: ModuleName[] = [
  "appWindow",
  "database",
  "fs",
  "os",
  "path",
  "process",
  "shell",
  "network",
  "update",
  "cloudSync",
  "tray",
  "net",
  "dgram",
  "http",
  "fetch",
  "express",
  "ws",
  "admZip",
  "mongoose-sqlite",
];

export async function runInitWizard(
  nameArg?: string,
  options: { nonInteractive?: boolean; template?: "vue3+ts" | "vanilla-js" } =
    {},
) {
  const isTty = Deno.stdin.isTerminal();
  const nonInteractive = options.nonInteractive || !isTty;

  const isCurrentDir = !nameArg || nameArg === "." || nameArg === "./";
  const projectDir = isCurrentDir ? resolve(Deno.cwd()) : resolve(Deno.cwd(), nameArg);
  const baseNameCandidate = basename(projectDir).replace(/[^a-zA-Z0-9_-]/g, "");
  let appName = baseNameCandidate.length > 0 ? baseNameCandidate : "MyRitaApp";
  let displayName = `${appName} Desktop`;
  let version = "1.0.0";
  let appId = `com.ritawapp.${appName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  let template: "vue3+ts" | "vanilla-js" = options.template || "vue3+ts";
  let selectedModules: "all" | "minimal" | ModuleName[] = "all";

  if (!nonInteractive) {
    logger.banner(
      "RitaWapp Application Generator",
      "Interactive Project Wizard v1.0.1",
    );

    appName = await Input.prompt({
      message: "Project Name:",
      default: appName,
      validate: (val: string) => {
        if (/^[a-zA-Z0-9_\-]+$/.test(val)) return true;
        return "Must contain only alphanumeric characters, dashes, or underscores.";
      },
    });

    displayName = await Input.prompt({
      message: "Display Name:",
      default: `${appName} Desktop`,
    });

    version = await Input.prompt({
      message: "Version:",
      default: "1.0.0",
      validate: (val: string) =>
        /^\d+\.\d+\.\d+/.test(val) || "Must be semver (e.g. 1.0.0)",
    });

    appId = await Input.prompt({
      message: "Application ID:",
      default: `com.ritawapp.${
        appName.toLowerCase().replace(/[^a-z0-9]/g, "")
      }`,
    });

    template = (await Select.prompt({
      message: "Select Frontend Template:",
      options: [
        {
          name: "Vue 3 + TypeScript SPA (Rich desktop UI & integrated modules)",
          value: "vue3+ts",
        },
        {
          name:
            "Vanilla JavaScript + HTML5 (Pure lightweight, zero bundler needed)",
          value: "vanilla-js",
        },
      ],
      default: "vue3+ts",
    })) as "vue3+ts" | "vanilla-js";

    const modulePreset = await Select.prompt({
      message: "Select Integrated Native Modules:",
      options: [
        {
          name:
            "Full    - All 18 integrated native modules (Database, Network, OS, Shell, Express, WS, Tray...)",
          value: "all",
        },
        {
          name:
            "Minimal - Core modules only (Window Controls & Embedded SQLite Database)",
          value: "minimal",
        },
        { name: "Custom  - Select specific modules manually", value: "custom" },
      ],
      default: "all",
    });

    if (modulePreset === "all") {
      selectedModules = "all";
    } else if (modulePreset === "minimal") {
      selectedModules = "minimal";
    } else {
      const chosen = await Checkbox.prompt({
        message: "Choose native modules to enable:",
        options: ALL_MODULES.map((m) => ({ name: m, value: m })),
        default: ["appWindow", "database", "fs", "os", "shell"],
      });
      selectedModules = chosen as ModuleName[];
    }
  }

  // Generate 256-bit AES key
  const aesKeyBytes = new Uint8Array(32);
  crypto.getRandomValues(aesKeyBytes);
  const aesKey = Array.from(aesKeyBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  await Deno.mkdir(projectDir, { recursive: true });

  // 1. Create RitaWapp.json
  const configObj: RitaWappConfig = {
    app: {
      name: appName,
      displayName,
      version,
      appId,
      description: "Built with RitaWapp Desktop Framework",
      appIcon: "app.ico",
    },
    window: {
      title: displayName,
      width: 1024,
      height: 720,
      minWidth: 400,
      minHeight: 300,
      resizable: true,
      frameless: template === "vue3+ts",
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
      tooltip: displayName,
      icon: "app.ico",
      hideToTrayOnMinimize: false,
      items: [],
    },
    modules: selectedModules,
    assetsMod: false,
    security: {
      aesKey,
      cipher: "AES-256-GCM",
    },
    compiler: {
      appBrowserMode: "webview2AutoInstall",
      gccPath: "gcc",
      optimization: "-Os",
      extraFlags: [],
    },
  };

  await Deno.writeTextFile(
    join(projectDir, "RitaWapp.json"),
    JSON.stringify(configObj, null, 2),
  );

  // 2. Copy Template Files
  const frameworkRoot = getFrameworkRoot();
  const templateSourceDir = template === "vue3+ts"
    ? join(frameworkRoot, "Core", "templates", "vue-ts")
    : join(frameworkRoot, "Core", "templates", "vanilla");

  await copyDir(templateSourceDir, projectDir);

  // 3. Create .gitignore
  const gitignoreContent = `.dev/
dist/bin/
`;
  await Deno.writeTextFile(join(projectDir, ".gitignore"), gitignoreContent);

  logger.banner("Project Initialized Successfully", `Directory: ${projectDir}`);
  logger.success(`Created project '${appName}' with template '${template}'`);
  logger.success(`Generated 256-bit AES-GCM container key`);
  logger.divider();
  console.log(`\nNext steps to run your app:\n`);
  if (!isCurrentDir) {
    console.log(`  cd ${nameArg}`);
  }
  console.log(`  rwa dev        # Start dev mode with hot reload`);
  console.log(`  rwa build      # Compile standalone native executable\n`);
}

async function copyDir(src: string, dest: string) {
  await Deno.mkdir(dest, { recursive: true });
  for await (const entry of Deno.readDir(src)) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile) {
      await Deno.copyFile(srcPath, destPath);
    }
  }
}
