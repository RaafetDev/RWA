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

  // 3. Hot Live-Reload Client
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

    // Proxy WebUI JavaScript bridge
    if (url.pathname === "/webui.js") {
      const webuiPort = await getWebuiPort();
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 25; attempt++) {
        try {
          const res = await fetch(`http://127.0.0.1:${webuiPort}/webui.js`);
          if (res.ok) {
            const jsText = await res.text();
            const elapsed = (performance.now() - startTime).toFixed(1);
            logger.info(
              `[DevServer] GET /webui.js -> 200 application/javascript (${elapsed}ms)`,
            );
            return new Response(jsText, {
              status: 200,
              headers: {
                "Content-Type": "application/javascript; charset=utf-8",
              },
            });
          }
        } catch (err) {
          lastErr = err;
        }
        await new Promise((r) => setTimeout(r, 80));
      }
      logger.error(
        `[DevServer] Failed to proxy /webui.js from port ${webuiPort}: ${lastErr}`,
      );
      return new Response(`// WebUI not ready yet: ${lastErr}`, {
        status: 503,
        headers: { "Content-Type": "application/javascript; charset=utf-8" },
      });
    }

    // Proxy WebSocket bridge if requested through dev server
    if (
      url.pathname === "/_webui_ws_connect" ||
      url.pathname.includes("_webui_ws")
    ) {
      if (req.headers.get("upgrade") === "websocket") {
        const webuiPort = await getWebuiPort();
        const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);
        try {
          const backendWs = new WebSocket(
            `ws://127.0.0.1:${webuiPort}/_webui_ws_connect`,
          );
          backendWs.onopen = () => {
            clientSocket.onmessage = (e) => {
              if (backendWs.readyState === WebSocket.OPEN) {
                backendWs.send(e.data);
              }
            };
            backendWs.onmessage = (e) => {
              if (clientSocket.readyState === WebSocket.OPEN) {
                clientSocket.send(e.data);
              }
            };
          };
          clientSocket.onclose = () => {
            try {
              backendWs.close();
            } catch {}
          };
          backendWs.onclose = () => {
            try {
              clientSocket.close();
            } catch {}
          };
          clientSocket.onerror = () => {
            try {
              backendWs.close();
            } catch {}
          };
          backendWs.onerror = () => {
            try {
              clientSocket.close();
            } catch {}
          };
        } catch (wsErr) {
          logger.error(`[DevServer] WebSocket proxy error: ${wsErr}`);
        }
        return response;
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
            if (!html.includes("/webui.js")) {
              html = html.includes("<head>")
                ? html.replace(
                  "<head>",
                  `<head>\n  <script src="/webui.js"></script>`,
                )
                : `<script src="/webui.js"></script>\n` + html;
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
    const relevantPaths = event.paths.filter((p) => {
      const norm = p.replaceAll("\\", "/");
      return (
        !norm.includes("/.dev/") &&
        !norm.includes("/.rwa/") &&
        !norm.includes("/dist/") &&
        !norm.includes("/dist") &&
        !norm.includes(".git")
      );
    });

    if (relevantPaths.length === 0) continue;

    let lastChangedFile = "";
    for (const p of relevantPaths) {
      const norm = p.replaceAll("\\", "/").toLowerCase();
      lastChangedFile = p;
      if (
        norm.endsWith(".json") ||
        norm.endsWith(".c") ||
        norm.endsWith(".h") ||
        norm.endsWith("ritawapp.config.ts")
      ) {
        pendingNative = true;
      } else if (
        norm.endsWith(".vue") ||
        norm.endsWith(".ts") ||
        norm.endsWith(".js") ||
        norm.endsWith(".html") ||
        norm.endsWith(".css") ||
        norm.endsWith(".svg") ||
        norm.endsWith(".png") ||
        norm.endsWith(".ico")
      ) {
        pendingFrontend = true;
      }
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(async () => {
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
      }
    }, 200);
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
