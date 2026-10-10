/**
 * ============================================================================
 * Core/toolchain/dev.ts
 * ============================================================================
 * RitaWapp Smart Hot-Reload Development Engine
 * Serves frontend over HTTP with live-reload; restarts native runtime on C/config edits.
 * ============================================================================
 */

import { join } from "jsr:@std/path@1.0.9";
import { compileProject } from "./compile.ts";
import { compileVueProject } from "./compile_vue.ts";
import { getProjectRoot } from "./paths.ts";
import { loadConfigFile } from "../config/config.ts";
import {
  INTEGRATED_MODULES,
  resolveEnabledModules,
} from "../modules/integrated/registry.ts";
import { logger } from "../cli/logger.ts";

export interface DevServerOptions {
  projectDir?: string;
  isBrowser?: boolean;
}

const MIME_MAP: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".ts": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

const LIVE_RELOAD_SNIPPET = `
<script>
(() => {
  // 1. Re-enable Right-Click context menu for Developer Inspect
  window.addEventListener('contextmenu', (e) => {
    e.stopPropagation();
  }, true);

  // 2. DevTools Keyboard Accelerators (F12, Ctrl+Shift+I)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i'))) {
      console.log('[RitaWapp Dev] F12 / Ctrl+Shift+I requested');
      if (window.appWindow && typeof window.appWindow.openDevTools === 'function') {
        window.appWindow.openDevTools();
      } else if (typeof window.rita_module_call === 'function') {
        window.rita_module_call(JSON.stringify({ module: "appWindow", action: "openDevTools", args: [] }));
      }
    }
  }, true);

  // 3. Forward Console Logs to Dev Server
  ['log', 'warn', 'error'].forEach((level) => {
    const orig = console[level];
    console[level] = (...args) => {
      orig.apply(console, args);
      try {
        fetch('/rwa-debug-log', {
          method: 'POST',
          body: '[' + level.toUpperCase() + '] ' + args.map(a => {
            if (a instanceof Error) return a.stack || a.message;
            if (typeof a === 'object' && a !== null) {
              try { return JSON.stringify(a); } catch(_) { return String(a); }
            }
            return String(a);
          }).join(' ')
        }).catch(() => {});
      } catch (_) {}
    };
  });

  // 4. Hot Live-Reload Client
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  function connect() {
    const ws = new WebSocket(protocol + '//' + location.host + '/rwa-live-reload');
    ws.onmessage = (e) => {
      if (e.data === 'reload') {
        console.log('[RitaWapp Dev] Hot reload triggered by file change. Refreshing...');
        location.reload();
      }
    };
    ws.onclose = () => setTimeout(connect, 1000);
  }
  connect();
})();
</script>
`;

export async function createDevServer(projectDir: string): Promise<{
  devUrl: string;
  devPort: number;
  sockets: Set<WebSocket>;
  close: () => Promise<void>;
}> {
  const sockets = new Set<WebSocket>();
  let devPort = 5173;
  let serverAcquired = false;
  let serverInstance: Deno.HttpServer | null = null;

  async function getWebuiPort(): Promise<number> {
    try {
      const portStr = await Deno.readTextFile(
        join(projectDir, ".rwa", "webui_port"),
      );
      const p = parseInt(portStr.trim(), 10);
      if (!isNaN(p) && p > 0) return p;
    } catch {}
    return 54321;
  }

  const handler = async (req: Request): Promise<Response> => {
    const startTime = performance.now();
    const url = new URL(req.url);

    // Debug log endpoint from client
    if (url.pathname === "/rwa-debug-log") {
      const msg = await req.text();
      logger.info(`[BrowserConsole] ${msg}`);
      return new Response("ok");
    }

    // WebSocket live reload endpoint
    if (url.pathname === "/rwa-live-reload") {
      if (req.headers.get("upgrade") === "websocket") {
        const { socket, response } = Deno.upgradeWebSocket(req);
        sockets.add(socket);
        socket.onclose = () => sockets.delete(socket);
        return response;
      }
      return new Response("WebSocket required", { status: 400 });
    }


    // Dev Server Native RPC Fallback endpoint (executes real operations when browser/client calls /_rwa_rpc)
    if (url.pathname === "/_rwa_rpc" && req.method === "POST") {
      try {
        const bodyText = await req.text();
        const rpcReq = JSON.parse(bodyText);
        const { module, action, args = [] } = rpcReq;

        if (module === "ping") {
          return new Response(JSON.stringify({ success: true, data: "pong" }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        let result: any = null;
        let handled = false;

        if (module === "os") {
          const cpus = navigator.hardwareConcurrency || 8;
          let diskId = "VOL_UNKNOWN";
          let boardId = "MB_UNKNOWN";
          let guid = "";
          try {
            const p = new Deno.Command("reg", {
              args: ["query", "HKLM\\Software\\Microsoft\\Cryptography", "/v", "MachineGuid"],
              stdout: "piped",
              stderr: "null",
            });
            const out = await p.output();
            const text = new TextDecoder().decode(out.stdout);
            const m = text.match(/MachineGuid\s+REG_SZ\s+([A-Fa-f0-9\-]+)/);
            if (m && m[1]) guid = m[1].trim();
          } catch {}

          if (!guid) {
            guid = Deno.env.get("COMPUTERNAME") || "RITAWAPP_HOST";
          }
          diskId = guid;
          boardId = guid;

          const rawSeed = `${diskId}:${boardId}:${Deno.env.get("COMPUTERNAME") || ""}:${guid}`;
          const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawSeed));
          const fingerprint = Array.from(new Uint8Array(hashBuf))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

          if (action === "getInfo") {
            result = {
              platform: Deno.build.os === "windows" ? "win32" : Deno.build.os,
              arch: Deno.build.arch,
              type: "Windows_NT",
              release: "10.0.22631",
              hostname: Deno.env.get("COMPUTERNAME") || "DEV-PC",
              homedir: Deno.env.get("USERPROFILE") || "C:\\Users",
              tmpdir: Deno.env.get("TEMP") || "C:\\Temp",
              totalmem: 16 * 1024 * 1024 * 1024,
              freemem: 8 * 1024 * 1024 * 1024,
              uptime: Math.floor(performance.now() / 1000),
              cpuCount: cpus,
              cpuid: "BFEBFBFF000306A9",
              harddriveId: diskId,
              motherboardId: boardId,
              fingerprint: fingerprint,
            };
            handled = true;
          } else if (action === "platform") {
            result = Deno.build.os === "windows" ? "win32" : Deno.build.os;
            handled = true;
          } else if (action === "arch") {
            result = Deno.build.arch;
            handled = true;
          } else if (action === "hostname") {
            result = Deno.env.get("COMPUTERNAME") || "DEV-PC";
            handled = true;
          } else if (action === "homedir") {
            result = Deno.env.get("USERPROFILE") || "C:\\Users";
            handled = true;
          } else if (action === "tmpdir") {
            result = Deno.env.get("TEMP") || "C:\\Temp";
            handled = true;
          } else if (action === "uptime") {
            result = Math.floor(performance.now() / 1000);
            handled = true;
          } else if (action === "cpuCount") {
            result = cpus;
            handled = true;
          } else if (action === "getFingerprint" || action === "fingerprint") {
            result = fingerprint;
            handled = true;
          }
        } else if (module === "process") {
          if (action === "getInfo" || action === "env") {
            result = {
              pid: Deno.pid,
              platform: Deno.build.os === "windows" ? "win32" : Deno.build.os,
              arch: Deno.build.arch,
              cwd: projectDir,
              env: Deno.env.toObject(),
              uptime: Math.floor(performance.now() / 1000),
            };
            handled = true;
          } else if (action === "cwd") {
            result = projectDir;
            handled = true;
          }
        } else if (module === "network") {
          if (action === "isOnline") {
            result = true;
            handled = true;
          } else if (action === "ping") {
            result = { ok: true, latencyMs: 5, alive: true, timeMs: 5 };
            handled = true;
          }
        } else if (module === "fs") {
          if (action === "getAppDir") {
            result = projectDir;
            handled = true;
          } else if (action === "getAssetsDir") {
            result = join(projectDir, "dist");
            handled = true;
          } else {
            const target = args[0] !== undefined && args[0] !== null ? String(args[0]) : "";
            const isAbs = target.includes(":") || target.startsWith("\\\\") || target.startsWith("/");
            const fullPath = isAbs ? target : join(projectDir, target);

            if (action === "exists" || action === "existsSync") {
              try {
                await Deno.stat(fullPath);
                result = true;
              } catch {
                result = false;
              }
              handled = true;
            } else if (action === "stat" || action === "statSync") {
              try {
                const info = await Deno.stat(fullPath);
                result = {
                  size: info.size,
                  isFile: info.isFile,
                  isDirectory: info.isDirectory,
                  mtime: info.mtime ? info.mtime.toISOString() : new Date().toISOString(),
                };
              } catch {
                return new Response(
                  JSON.stringify({ success: false, error: "ENOENT: no such file or directory" }),
                  { headers: { "Content-Type": "application/json" } },
                );
              }
              handled = true;
            } else if (action === "readFile" || action === "readFileSync") {
              try {
                result = await Deno.readTextFile(fullPath);
                handled = true;
              } catch (fsErr: any) {
                return new Response(
                  JSON.stringify({ success: false, error: fsErr?.message || "ENOENT" }),
                  { headers: { "Content-Type": "application/json" } },
                );
              }
            } else if (action === "writeFile" || action === "writeFileSync") {
              const content = args[1] !== undefined ? String(args[1]) : "";
              try {
                await Deno.writeTextFile(fullPath, content);
                result = true;
                handled = true;
              } catch (fsErr: any) {
                return new Response(
                  JSON.stringify({ success: false, error: fsErr?.message || "Write error" }),
                  { headers: { "Content-Type": "application/json" } },
                );
              }
            } else if (action === "appendFile") {
              const content = args[1] !== undefined ? String(args[1]) : "";
              try {
                await Deno.writeTextFile(fullPath, content, { append: true });
                result = true;
                handled = true;
              } catch (fsErr: any) {
                return new Response(
                  JSON.stringify({ success: false, error: fsErr?.message || "Append error" }),
                  { headers: { "Content-Type": "application/json" } },
                );
              }
            } else if (action === "mkdir" || action === "mkdirSync") {
              try {
                await Deno.mkdir(fullPath, { recursive: true });
                result = true;
                handled = true;
              } catch (fsErr: any) {
                return new Response(
                  JSON.stringify({ success: false, error: fsErr?.message || "Mkdir error" }),
                  { headers: { "Content-Type": "application/json" } },
                );
              }
            } else if (action === "unlink" || action === "unlinkSync") {
              try {
                await Deno.remove(fullPath);
                result = true;
                handled = true;
              } catch (fsErr: any) {
                return new Response(
                  JSON.stringify({ success: false, error: fsErr?.message || "ENOENT" }),
                  { headers: { "Content-Type": "application/json" } },
                );
              }
            } else if (action === "readdir" || action === "readdirSync") {
              try {
                const entries = [];
                for await (const dirEntry of Deno.readDir(fullPath)) {
                  entries.push(dirEntry.name);
                }
                result = entries;
                handled = true;
              } catch {
                result = [];
                handled = true;
              }
            }
          }
        } else if (module === "shell") {
          if (action === "exec") {
            const cmd = args[0] ? String(args[0]) : "";
            try {
              const p = new Deno.Command("cmd.exe", {
                args: ["/c", cmd],
                stdout: "piped",
                stderr: "piped",
              });
              const output = await p.output();
              result = {
                stdout: new TextDecoder().decode(output.stdout),
                stderr: new TextDecoder().decode(output.stderr),
                exitCode: output.code,
              };
            } catch (err: any) {
              result = {
                stdout: "",
                stderr: err.message || String(err),
                exitCode: 1,
              };
            }
            handled = true;
          } else if (action === "openExternal") {
            const target = args[0] ? String(args[0]) : "";
            try {
              const p = new Deno.Command("cmd.exe", {
                args: ["/c", "start", "", target],
              });
              await p.output();
              result = true;
            } catch {
              result = false;
            }
            handled = true;
          }
        }

        if (handled) {
          return new Response(JSON.stringify({ success: true, data: result }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({
            success: false,
            error: `MOCK: no handler for ${module}.${action}`,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      } catch (rpcErr: any) {
        return new Response(
          JSON.stringify({ success: false, error: rpcErr?.message || String(rpcErr) }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    let reqPath = decodeURIComponent(url.pathname);
    if (reqPath === "/" || reqPath === "") reqPath = "/index.html";

    // Try candidate roots: projectDir/dist, then projectDir
    const candidates = [
      join(projectDir, "dist", reqPath),
      join(projectDir, reqPath),
    ];

    for (const filePath of candidates) {
      try {
        const stat = await Deno.stat(filePath);
        if (stat.isFile) {
          const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
          const contentType = MIME_MAP[ext] || "application/octet-stream";

          if (ext === ".html") {
            let html = await Deno.readTextFile(filePath);
            const webuiPort = await getWebuiPort();
            const webuiScriptTag = `<script src="http://localhost:${webuiPort}/webui.js"></script>`;

            try {
              const cfg = await loadConfigFile(projectDir);
              const resolved = resolveEnabledModules(cfg.modules);
              const enabledMap: Record<string, boolean> = {};
              for (const m of Object.keys(INTEGRATED_MODULES)) {
                enabledMap[m] = resolved.enabled.includes(m as any);
              }
              const modScript = `<script>window.__RWA_ENABLED_MODULES__ = ${
                JSON.stringify(enabledMap)
              };</script>`;
              if (!html.includes("__RWA_ENABLED_MODULES__")) {
                html = html.includes("<head>")
                  ? html.replace("<head>", `<head>\n  ${modScript}`)
                  : `${modScript}\n` + html;
              }
            } catch {}

            // Replace any existing src="/webui.js" or inject the webui script pointing to http://localhost:<webuiPort>/webui.js
            if (/src=["']\/webui\.js["']/.test(html)) {
              html = html.replace(/src=["']\/webui\.js["']/g, `src="http://localhost:${webuiPort}/webui.js"`);
            } else if (!html.includes("/webui.js")) {
              html = html.includes("<head>")
                ? html.replace("<head>", `<head>\n  ${webuiScriptTag}`)
                : `${webuiScriptTag}\n` + html;
            }

            if (!html.includes("/rwa-live-reload")) {
              html = html.includes("</body>")
                ? html.replace("</body>", `${LIVE_RELOAD_SNIPPET}</body>`)
                : html + LIVE_RELOAD_SNIPPET;
            }
            const elapsed = (performance.now() - startTime).toFixed(1);
            logger.info(
              `[DevServer] GET ${url.pathname} -> 200 text/html (${elapsed}ms)`,
            );
            return new Response(html, {
              headers: { "Content-Type": contentType },
            });
          }

          const fileBytes = await Deno.readFile(filePath);
          const elapsed = (performance.now() - startTime).toFixed(1);
          logger.info(
            `[DevServer] GET ${url.pathname} -> 200 ${contentType} (${elapsed}ms)`,
          );
          return new Response(fileBytes, {
            headers: { "Content-Type": contentType },
          });
        }
      } catch {
        // file not found, try next candidate
      }
    }

    const elapsed = (performance.now() - startTime).toFixed(1);
    logger.warn(
      `[DevServer] GET ${url.pathname} -> 404 Not Found (${elapsed}ms)`,
    );
    return new Response("Not Found", { status: 404 });
  };

  // Find open port starting from 5173
  while (!serverAcquired && devPort < 5200) {
    try {
      serverInstance = Deno.serve(
        { port: devPort, hostname: "127.0.0.1", onListen: () => {} },
        handler,
      );
      serverAcquired = true;
    } catch {
      devPort++;
    }
  }

  const devUrl = `http://127.0.0.1:${devPort}`;
  return {
    devUrl,
    devPort,
    sockets,
    close: async () => {
      if (serverInstance) {
        await serverInstance.shutdown();
      }
    },
  };
}

export async function runDevServer(options: DevServerOptions = {}) {
  const projectDir = getProjectRoot(options.projectDir);
  const cfg = await loadConfigFile(projectDir);

  logger.banner(
    `RitaWapp Dev Mode: ${cfg.app.displayName}`,
    `Live reloading active in: ${projectDir}`,
  );

  const { devUrl, sockets } = await createDevServer(projectDir);
  logger.info(`Dev server listening on: ${devUrl}`);

  // 2. Initial compilation
  logger.info("Performing initial dev compilation...");
  let currentBuild = await compileProject({ projectDir, isDev: true });

  // 3. Launch native executable with --dev <devUrl>
  const args = ["--dev", devUrl];
  if (options.isBrowser) args.push("--browser");

  let appProcess = launchAppProcess(currentBuild.exePath, args, projectDir);

  // 4. Setup File Watcher
  logger.success("Runtime launched. Watching for changes...");
  console.log(
    "  • Frontend changes (vue/ts/html/css) -> Instant hot-reload via dev server",
  );
  console.log(
    "  • Native / Config changes (json/c/h) -> Full native recompile & restart\n",
  );

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let isRecompiling = false;
  let pendingFrontend = false;
  let pendingNative = false;

  const watcher = Deno.watchFs([projectDir], { recursive: true });

  const shutdown = () => {
    logger.info("Shutting down dev runtime...");
    try {
      if (appProcess) appProcess.kill("SIGTERM");
    } catch {}
    Deno.exit(0);
  };

  try {
    Deno.addSignalListener("SIGINT", shutdown);
  } catch {}

  for await (const event of watcher) {
    const projectDirNorm = projectDir.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
    const relevantPaths = event.paths.filter((p) => {
      const norm = p.replaceAll("\\", "/").toLowerCase();
      const baseName = norm.split("/").pop() || "";
      if (baseName.startsWith(".")) return false;
      if (
        norm.includes("/dist/") ||
        norm.endsWith("/dist") ||
        norm.includes("/.rwa/") ||
        norm.includes("/.dev/") ||
        norm.includes("/.git/") ||
        norm.includes("/node_modules/") ||
        norm.endsWith(".db") ||
        norm.endsWith(".db-wal") ||
        norm.endsWith(".db-shm") ||
        baseName === ".rwa_dev_db.json"
      ) {
        return false;
      }
      return true;
    });

    if (relevantPaths.length === 0) continue;

    let lastChangedFile = "";
    for (const p of relevantPaths) {
      const norm = p.replaceAll("\\", "/").toLowerCase();
      const baseName = p.replaceAll("\\", "/").split("/").pop() || "";
      const isNative = norm.endsWith(".c") || norm.endsWith(".h") || baseName === "RitaWapp.json";
      const isFrontend = (
        norm.startsWith(`${projectDirNorm}/src/`) ||
        norm.startsWith(`${projectDirNorm}/public/`) ||
        baseName === "index.html"
      );

      if (isNative) {
        lastChangedFile = p;
        pendingNative = true;
      } else if (isFrontend) {
        lastChangedFile = p;
        pendingFrontend = true;
      }
    }

    if (!pendingNative && !pendingFrontend) continue;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(async () => {
      if (isRecompiling) return;
      isRecompiling = true;
      try {
        if (pendingNative) {
          const oldPid = appProcess ? appProcess.pid : "none";
          logger.info(
            `Native sources or configuration changed (${lastChangedFile}). Recompiling runtime...`,
          );
          try {
            if (appProcess) appProcess.kill("SIGKILL");
          } catch {}

          currentBuild = await compileProject({ projectDir, isDev: true });
          appProcess = launchAppProcess(currentBuild.exePath, args, projectDir);
          logger.success(
            `Native runtime restarted (PID: ${oldPid} -> New PID: ${appProcess.pid}).`,
          );
        } else if (pendingFrontend) {
          const currentPid = appProcess ? appProcess.pid : "active";
          logger.info(
            `Frontend source modified (${lastChangedFile}). Recompiling Vue/TS assets...`,
          );
          try {
            const appVuePath = join(projectDir, "src", "App.vue");
            const stat = await Deno.stat(appVuePath);
            if (stat.isFile) {
              await compileVueProject(projectDir);
            }
          } catch {}
          logger.info(
            `Frontend compilation complete. Triggering instant webview reload (PID: ${currentPid} maintained)...`,
          );
          for (const s of sockets) {
            try {
              if (s.readyState === WebSocket.OPEN) {
                s.send("reload");
              }
            } catch {}
          }
          logger.success(
            `Webview reload signal sent to client(s) (PID: ${currentPid} maintained).`,
          );
        }
      } catch (err: unknown) {
        logger.error(`Live reload error: ${(err as Error).message}`);
      } finally {
        pendingNative = false;
        pendingFrontend = false;
        debounceTimer = null;
        isRecompiling = false;
      }
    }, 300);
  }
}

export function launchAppProcess(
  exePath: string,
  args: string[] = [],
  cwd?: string,
): Deno.ChildProcess {
  logger.debug(
    `Launching: ${exePath} ${args.join(" ")} (cwd: ${cwd || Deno.cwd()})`,
  );
  const cmd = new Deno.Command(exePath, {
    args,
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  return cmd.spawn();
}

/**
 * Runs the compiled application binary.
 */
export async function runCompiledApp(
  projectDirArg?: string,
  extraArgs: string[] = [],
): Promise<Deno.CommandStatus> {
  const projectDir = getProjectRoot(projectDirArg);
  const cfg = await loadConfigFile(projectDir);
  const exePath = join(projectDir, "dist", "bin", `${cfg.app.name}.exe`);

  const bundleName = "Rita.W.app";
  const bundlePath = join(projectDir, "dist", "bin", bundleName);

  let needsCompile = false;
  try {
    const exeStat = await Deno.stat(exePath);
    if (!exeStat.isFile) needsCompile = true;
    const bundleStat = await Deno.stat(bundlePath);
    if (!bundleStat.isFile || bundleStat.size < 44) needsCompile = true;
  } catch {
    needsCompile = true;
  }

  if (needsCompile) {
    logger.info(
      `Valid production binary or container not found. Compiling project...`,
    );
    await compileProject({ projectDir });
  }

  logger.info(`Launching ${cfg.app.displayName} (${exePath})...`);
  const cmd = new Deno.Command(exePath, {
    args: extraArgs,
    cwd: projectDir,
    stdout: "inherit",
    stderr: "inherit",
  });
  const proc = cmd.spawn();
  return await proc.status;
}
