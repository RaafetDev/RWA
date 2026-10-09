/**
 * ============================================================================
 * Core/toolchain/paths.ts
 * ============================================================================
 * RitaWapp Universal Path & Workspace Resolver
 * Resolves Framework Root and Consumer Project Root reliably across all environments.
 * ============================================================================
 */

import { dirname, fromFileUrl, join, resolve } from "jsr:@std/path@1.0.9";

let cachedFrameworkRoot: string | null = null;

/**
 * Returns the absolute path to the RitaWapp Framework root directory.
 */
export function getFrameworkRoot(): string {
  if (cachedFrameworkRoot) return cachedFrameworkRoot;

  // 1. Check explicit environment variable
  const envRoot = Deno.env.get("RITA_FRAMEWORK_ROOT") ||
    Deno.env.get("RWA_ROOT");
  if (envRoot && envRoot.trim()) {
    const norm = resolve(envRoot.trim());
    if (hasFrameworkMarkers(norm)) {
      cachedFrameworkRoot = norm;
      return norm;
    }
  }

  // 2. Check localappdata rwa.root pointer (set by 'rwa setup')
  try {
    const localAppData = Deno.env.get("LOCALAPPDATA") ||
      (Deno.env.get("USERPROFILE")
        ? `${Deno.env.get("USERPROFILE")}\\AppData\\Local`
        : null);
    if (localAppData) {
      const pointerFile = join(localAppData, "RitaWapp", "bin", "rwa.root");
      const stat = Deno.statSync(pointerFile);
      if (stat.isFile) {
        const rootContent = Deno.readTextFileSync(pointerFile).trim();
        if (rootContent && hasFrameworkMarkers(rootContent)) {
          cachedFrameworkRoot = resolve(rootContent);
          return cachedFrameworkRoot;
        }
      }
    }
  } catch {
    // Ignore if not present
  }

  // 3. Resolve relative to import.meta.url
  const currentFilePath = fromFileUrl(import.meta.url);
  let searchDir = dirname(currentFilePath);

  for (let i = 0; i < 5; i++) {
    if (hasFrameworkMarkers(searchDir)) {
      cachedFrameworkRoot = resolve(searchDir);
      return cachedFrameworkRoot;
    }
    const parent = dirname(searchDir);
    if (parent === searchDir) break;
    searchDir = parent;
  }

  // Fallback to Deno.cwd()
  cachedFrameworkRoot = resolve(Deno.cwd());
  return cachedFrameworkRoot;
}

function hasFrameworkMarkers(dir: string): boolean {
  try {
    const marker1 = join(dir, "Core", "runtime", "core", "main.c");
    const stat1 = Deno.statSync(marker1);
    if (stat1.isFile) return true;
  } catch {}

  try {
    const marker2 = join(dir, "RitaWapp.ts");
    const stat2 = Deno.statSync(marker2);
    if (stat2.isFile) return true;
  } catch {}

  return false;
}

/**
 * Discovers the project root directory containing RitaWapp configuration.
 * Searches upwards from targetDir or Deno.cwd().
 */
export function getProjectRoot(targetDir?: string): string {
  let cur = resolve(targetDir || Deno.cwd());

  for (let i = 0; i < 6; i++) {
    if (hasProjectConfig(cur)) {
      return cur;
    }
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }

  return resolve(targetDir || Deno.cwd());
}

export function hasProjectConfig(dir: string): boolean {
  const configs = [
    "RitaWapp.json",
    "ritawapp.json",
    "RitaWapp.config.ts",
    "RitaWapp-config.ts",
    "ritawapp.config.ts",
  ];
  for (const name of configs) {
    try {
      const stat = Deno.statSync(join(dir, name));
      if (stat.isFile) return true;
    } catch {}
  }
  return false;
}
