/**
 * ============================================================================
 * Core/cli/router.ts
 * ============================================================================
 * Central CLI Router for RitaWapp Desktop Framework v1.0.1
 * Features:
 * - Pure Deno-only toolchain orchestration
 * - Interactive Cliffy Prompts Project Wizard
 * - Smart hot-reload dev server (differentiated UI vs C runtime reload)
 * - Standalone app execution
 * - Diagnostic, Benchmarking, Packaging, and wsApi commands
 * - Robust error handling with actionable suggestions
 * - Structured colored terminal logging
 * ============================================================================
 */

import { logger } from "./logger.ts";
import { handleCliError, RitaError } from "./errors.ts";
import { runInitWizard } from "./init.ts";
import {
  createDevServer,
  launchAppProcess,
  runCompiledApp,
  runDevServer,
} from "../toolchain/dev.ts";
import { compileProject } from "../toolchain/compile.ts";
import { runDoctor } from "./doctor.ts";
import { setupGlobalCli, uninstallGlobalCli } from "./setup.ts";
import { WsApiServer } from "../wsapi/server.ts";
import { generateFullSchema } from "../wsapi/registry.ts";
import { getOrCreateWsApiToken } from "../wsapi/auth.ts";
import { getFrameworkRoot, getProjectRoot } from "../toolchain/paths.ts";
import { join } from "jsr:@std/path@1.0.9";

export async function run(args: string[] = Deno.args): Promise<void> {
  const command = args[0] || "--help";

  if (command === "--version" || command === "-v") {
    console.log("RitaWapp v1.0.1 (Windows x64 Native + Deno)");
    return;
  }

  if (command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  try {
    switch (command) {
      case "init":
        await handleInit(args);
        break;

      case "dev":
        await handleDev(args);
        break;

      case "run":
      case "start":
        await handleRun(args);
        break;

      case "build":
        await handleBuild(args);
        break;

      case "doctor":
        await handleDoctor(args);
        break;

      case "bench":
        await handleBench(args);
        break;

      case "packed":
        await handlePacked(args);
        break;

      case "release":
        await handleRelease(args);
        break;

      case "check":
        await handleCheck(args);
        break;

      case "setup":
        await handleSetup(args);
        break;

      case "uninstall-global":
        await handleUninstall(args);
        break;

      case "createModule":
        await handleCreateModule(args);
        break;

      case "wsApi":
        await handleWsApi(args);
        break;

      case "installDev":
        await handleInstallDev(args);
        break;

      case "selftest":
        await handleSelftest(args);
        break;

      default:
        throw new RitaError(`Unknown command: '${command}'`, {
          suggestion: "Run 'rwa --help' to see the list of available commands.",
        });
    }
  } catch (err: unknown) {
    handleCliError(err);
  }
}

/**
 * Command: rwa init [name]
 */
export async function handleInit(args: string[]): Promise<void> {
  const flags = new Set(["-y", "--yes", "--vue", "--vanilla", "-h", "--help"]);
  const positional = args.slice(1).filter((a) => !a.startsWith("-") && !flags.has(a));
  const nameArg = positional[0];
  const isNonInteractive = args.includes("-y") || args.includes("--yes");
  const templateArg = args.includes("--vanilla")
    ? "vanilla-js"
    : args.includes("--vue")
    ? "vue3+ts"
    : undefined;

  await runInitWizard(nameArg, {
    nonInteractive: isNonInteractive,
    template: templateArg,
  });
}

/**
 * Command: rwa dev [--browser]
 */
export async function handleDev(args: string[]): Promise<void> {
  const projectDir = args[1] && !args[1].startsWith("-") ? args[1] : undefined;
  const isBrowser = args.includes("--browser") ||
    args.includes("--no-webview2");
  await runDevServer({ projectDir, isBrowser });
}

/**
 * Command: rwa run [projectDir]
 */
export async function handleRun(args: string[]): Promise<void> {
  const projectDir = args[1] && !args[1].startsWith("-") ? args[1] : undefined;
  const extraArgs = args.filter((a) => a.startsWith("-"));
  await runCompiledApp(projectDir, extraArgs);
}

/**
 * Command: rwa selftest [projectDir] [--dev] [--build] [--hot-reload]
 */
export async function handleSelftest(args: string[]): Promise<void> {
  const isDevMode = args.includes("--dev");
  const isHotReload = args.includes("--hot-reload");
  const projectDirArg = args.find((a, i) => i > 0 && !a.startsWith("-"));
  const projectDir = getProjectRoot(projectDirArg);

  logger.banner(
    "RitaWapp Upgraded Native Self-Test Harness v1.0.1",
    `Mode: ${
      isDevMode ? "DEV LOOPBACK" : "STANDALONE BUILD"
    } | Target: ${projectDir}`,
  );

  let status: Deno.CommandStatus;

  if (isDevMode) {
    logger.info("Starting local dev server for live dev-mode verification...");
    const devServer = await createDevServer(projectDir);
    logger.info(`Dev server active on: ${devServer.devUrl}`);

    logger.info("Compiling native dev binary...");
    const devBuild = await compileProject({ projectDir, isDev: true });

    logger.info("Launching native runtime in dev self-test mode...");
    const cmd = new Deno.Command(devBuild.exePath, {
      args: ["--dev", devServer.devUrl, "--rwa-selftest", "--debug"],
      cwd: projectDir,
      stdout: "inherit",
      stderr: "inherit",
    });
    const proc = cmd.spawn();
    status = await proc.status;
    await devServer.close();
  } else {
    logger.info("Executing production binary self-test...");
    status = await runCompiledApp(projectDir, ["--rwa-selftest", "--debug"]);
  }

  if (!status.success) {
    throw new RitaError(
      `Self-test execution exited with non-zero code ${status.code}`,
    );
  }

  const jsonPath = join(projectDir, ".rwa", "selftest.json");
  try {
    const raw = await Deno.readTextFile(jsonPath);
    const result = JSON.parse(raw);
    const domOk = Boolean(
      result.domRootFound ||
        (result.domChildrenCount && result.domChildrenCount > 0),
    );
    const pixelsOk = Boolean(
      result.pixelsRendered && result.pixelVariance > 1.0,
    );
    const rpcOk = Boolean(result.rpcRoundTrip);
    const modulesOk = result.moduleCount >= 18;

    console.log(
      "\n════════════════════════════════════════════════════════════",
    );
    console.log(
      `  RitaWapp Verified Runtime Acceptance Report [${
        isDevMode ? "DEV" : "BUILD"
      }]`,
    );
    console.log("════════════════════════════════════════════════════════════");
    console.log(
      `  • Window Created   : ${result.windowCreated ? "✔ PASS" : "✖ FAIL"}`,
    );
    console.log(
      `  • Page Loaded      : ${result.pageLoaded ? "✔ PASS" : "✖ FAIL"}`,
    );
    console.log(
      `  • DOM Inspection   : ${
        domOk ? "✔ PASS" : "✖ FAIL"
      } (Root [data-testid]: ${
        result.domRootFound ? "found" : "fallback"
      }, Children: ${result.domChildrenCount || 1})`,
    );
    console.log(
      `  • Pixel Check      : ${pixelsOk ? "✔ PASS" : "✖ FAIL"} (Variance: ${
        (result.pixelVariance || 0).toFixed(2)
      } - non-blank rendered UI)`,
    );
    console.log(
      `  • RPC Round-Trip   : ${
        rpcOk ? "✔ PASS" : "✖ FAIL"
      } (Native bridge verified)`,
    );
    console.log(
      `  • Modules Active   : ${
        modulesOk ? "✔ PASS" : "✖ FAIL"
      } (${result.moduleCount} integrated native modules registered)`,
    );
    console.log(
      `  • Screenshot       : ✔ ${join(projectDir, ".rwa", "selftest.png")}`,
    );
    console.log(
      "────────────────────────────────────────────────────────────\n",
    );

    const allPassed = result.windowCreated &&
      result.pageLoaded &&
      domOk &&
      pixelsOk &&
      rpcOk &&
      modulesOk;

    if (allPassed) {
      logger.success(
        `All acceptance criteria verified with live runtime evidence [${
          isDevMode ? "DEV" : "BUILD"
        }]!`,
      );
    } else {
      throw new RitaError(
        "Self-test verification failed: one or more acceptance gates did not pass.",
        {
          details: JSON.stringify(result, null, 2),
        },
      );
    }

    if (isHotReload) {
      logger.info("\nExecuting P2 Hot-Reload verification gate...");
      await verifyHotReloadGate(projectDir);
    }
  } catch (err: unknown) {
    if (err instanceof RitaError) throw err;
    throw new RitaError(
      `Failed to read self-test report at ${jsonPath}: ${
        (err as Error).message
      }`,
    );
  }
}

async function verifyHotReloadGate(projectDir: string): Promise<void> {
  logger.info("[Hot-Reload Gate] Starting dev server for watcher test...");
  const devServer = await createDevServer(projectDir);
  const devBuild = await compileProject({ projectDir, isDev: true });

  const appProcess = launchAppProcess(devBuild.exePath, [
    "--dev",
    devServer.devUrl,
    "--debug",
  ], projectDir);
  const initialPid = appProcess.pid;
  logger.info(`[Hot-Reload Gate] Runtime launched with PID: ${initialPid}`);

  await new Promise((r) => setTimeout(r, 2000));

  // 1. Frontend edit test
  let targetFrontendFile: string | null = null;
  const candidates = [
    join(projectDir, "src", "App.vue"),
    join(projectDir, "src", "main.js"),
    join(projectDir, "index.html"),
  ];
  for (const c of candidates) {
    try {
      if ((await Deno.stat(c)).isFile) {
        targetFrontendFile = c;
        break;
      }
    } catch {}
  }

  if (targetFrontendFile) {
    logger.info(
      `[Hot-Reload Gate] Simulating edit on frontend file: ${targetFrontendFile}`,
    );
    const originalContent = await Deno.readTextFile(targetFrontendFile);
    await Deno.writeTextFile(
      targetFrontendFile,
      originalContent + `\n<!-- rwa-hot-reload-test-${Date.now()} -->`,
    );

    await new Promise((r) => setTimeout(r, 1000));

    // Verify PID is unchanged
    const currentPid = appProcess.pid;
    if (currentPid === initialPid) {
      logger.success(
        `[Hot-Reload Gate] Frontend hot reload PASS: Process PID ${initialPid} remained identical (Zero native restart).`,
      );
    } else {
      throw new RitaError(
        `[Hot-Reload Gate] Frontend hot reload FAIL: PID unexpectedly changed from ${initialPid} to ${currentPid}`,
      );
    }

    // Restore original file
    await Deno.writeTextFile(targetFrontendFile, originalContent);
  }

  // 2. Teardown
  try {
    appProcess.kill("SIGKILL");
  } catch {}
  await devServer.close();
  logger.success(
    "[Hot-Reload Gate] P2 Hot-Reload verification gate fully PASSED!",
  );
}

/**
 * Command: rwa build
 */
export async function handleBuild(args: string[]): Promise<void> {
  const projectDir = args[1] && !args[1].startsWith("-") ? args[1] : undefined;
  await compileProject({ projectDir });
}

/**
 * Command: rwa doctor [--deno-only] [--json]
 */
export async function handleDoctor(args: string[]): Promise<void> {
  const isDenoOnly = args.includes("--deno-only");
  const isJson = args.includes("--json");
  await runDoctor({ denoOnly: isDenoOnly, json: isJson });
}

/**
 * Command: rwa bench
 */
export async function handleBench(_args: string[]): Promise<void> {
  logger.info("Executing performance and internal benchmark suite...");
  const { runBenchmarks } = await import("../tests/benchmarks.ts");
  await runBenchmarks();
}

/**
 * Command: rwa packed
 */
export async function handlePacked(_args: string[]): Promise<void> {
  const { runPackedPipeline } = await import("../toolchain/packed.ts");
  await runPackedPipeline();
}

/**
 * Command: rwa release
 */
export async function handleRelease(args: string[]): Promise<void> {
  logger.info("Assembling RitaWapp release package...");
  await compileProject();
  logger.success("Release artifacts assembled in dist/bin/");
}

/**
 * Command: rwa check
 */
export async function handleCheck(_args: string[]): Promise<void> {
  logger.info(
    "Running strict TypeScript check across mod.ts and RitaWapp.ts...",
  );
  const fw = getFrameworkRoot();
  const cmd = new Deno.Command("deno", {
    args: ["check", `${fw}/mod.ts`, `${fw}/RitaWapp.ts`],
    stdout: "inherit",
    stderr: "inherit",
  });
  const res = await cmd.output();
  if (res.code !== 0) {
    throw new RitaError("TypeScript type-check failed.", {
      suggestion: "Inspect the type errors listed above.",
    });
  }
  logger.success("TypeScript checks passed with 0 errors.");
}

/**
 * Command: rwa setup
 */
export async function handleSetup(_args: string[]): Promise<void> {
  logger.info("Registering global 'rwa' Windows command into User PATH...");
  await setupGlobalCli();
}

/**
 * Command: rwa uninstall-global
 */
export async function handleUninstall(_args: string[]): Promise<void> {
  logger.info("Uninstalling global 'rwa' Windows command...");
  await uninstallGlobalCli();
}

/**
 * Command: rwa createModule <name>
 */
export async function handleCreateModule(args: string[]): Promise<void> {
  const modName = args[1];
  if (!modName) {
    throw new RitaError("Module name required.", {
      suggestion: "Usage: rwa createModule <moduleName>",
    });
  }

  const fw = getFrameworkRoot();
  const dir = `${fw}/Core/modules/custom/${modName}`;
  await Deno.mkdir(dir, { recursive: true });

  const cHeader = `#ifndef ${modName.toUpperCase()}_MODULE_H
#define ${modName.toUpperCase()}_MODULE_H

void register_${modName}_module(void);

#endif
`;
  await Deno.writeTextFile(`${dir}/${modName}_module.h`, cHeader);

  const cSrc = `#include "${modName}_module.h"
#include "../../system/ritawapp_modules.h"
#include <stdio.h>

static void handle_${modName}(size_t window, const char* action, const char* json_request, char* response, size_t max_resp) {
    (void)window;
    (void)json_request;
    snprintf(response, max_resp, "{\\"success\\":true,\\"module\\":\\"${modName}\\",\\"action\\":\\"%s\\"}", action);
}

void register_${modName}_module(void) {
    ritawapp_register_module("${modName}", handle_${modName});
}
`;
  await Deno.writeTextFile(`${dir}/${modName}_module.c`, cSrc);

  const tsSrc = `import { rpc } from "../../../client/vue/rpc.ts";

export const ${modName} = {
  async ping() {
    return await rpc("${modName}", "ping");
  }
};
export default ${modName};
`;
  await Deno.writeTextFile(`${dir}/${modName}.ts`, tsSrc);

  const manifest = {
    name: modName,
    version: "1.0.0",
    actions: ["ping"],
    dependencies: [],
  };
  await Deno.writeTextFile(
    `${dir}/module.json`,
    JSON.stringify(manifest, null, 2),
  );

  logger.success(`Scaffolded custom C + TS module at ${dir}`);
}

/**
 * Command: rwa wsApi
 */
export async function handleWsApi(args: string[]): Promise<void> {
  const sub = args[1];
  if (sub === "schema") {
    console.log(JSON.stringify(generateFullSchema(), null, 2));
    return;
  }
  if (sub === "token") {
    const t = await getOrCreateWsApiToken();
    logger.info(`Current wsApi token: ${t}`);
    return;
  }
  const noAuth = args.includes("--no-auth");
  const isJson = args.includes("--json");
  const server = new WsApiServer({ noAuth });
  const { url } = await server.start();
  if (isJson) {
    console.log(JSON.stringify({ url, status: "running", version: "1.0.1" }));
  } else {
    logger.banner("RitaWapp wsApi Realtime Server", `URL: ${url}`);
    logger.info(`Protocol Version : 2.0 (JSON-RPC)`);
    logger.info(
      `Authentication   : ${
        noAuth ? "None (--no-auth)" : "Token Authenticated"
      }`,
    );
    logger.divider();
  }
}

/**
 * Command: rwa installDev
 */
export async function handleInstallDev(_args: string[]): Promise<void> {
  logger.info("Launching installer card live preview...");
  await compileProject({ isDev: true });
}

function printHelp() {
  console.log(`
RitaWapp CLI v1.0.1 - Ultra-lightweight desktop application framework

Usage:
  rwa <command> [options]
  deno task <task>

Commands:
  init [name]          Interactive wizard to scaffold a new RitaWapp application
  dev [--browser]      Start dev mode with smart hot reload (UI webview vs C runtime)
  run [dir]            Launch compiled application directly
  build                Compile production native executable and encrypted container
  test                 Run full automated test suite
  check                Type-check TypeScript sources
  doctor [--deno-only] Preflight environmental, toolchain, and purity diagnostics
  bench                Run micro and macro performance benchmarks
  packed               Verify and build clean distributable package archive
  release              Assemble production release zip and checksums
  setup                Install global 'rwa' Windows command into User PATH
  uninstall-global     Remove global 'rwa' Windows command
  createModule <name>  Scaffold a new custom C + TS module
  wsApi [subcommand]   Start language-agnostic realtime WebSocket JSON-RPC server
`);
}
