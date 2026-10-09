/**
 * RitaWapp Doctor - Environmental, Toolchain, and Purity Preflight Diagnostics
 */

import { existsSync } from "https://deno.land/std@0.224.0/fs/exists.ts";
import { getFrameworkRoot } from "../toolchain/paths.ts";

export interface DoctorReport {
  denoOnlyPassed: boolean;
  denoVersion: string;
  gccVersion: string;
  osVersion: string;
  rwaCmdPath: string | null;
  checks: {
    name: string;
    status: "PASS" | "FAIL" | "NOT VERIFIED";
    message: string;
  }[];
}

/**
 * Tripwire check to strictly enforce Deno-only rules.
 * Fails if any node artifact, package.json, or npm specifier exists.
 */
export async function runDenoOnlyTripwire(
  rootDir?: string,
): Promise<{ passed: boolean; violations: string[] }> {
  let root = rootDir || Deno.cwd();
  if (
    !existsSync(`${root}/RitaWapp.json`) && !existsSync(`${root}/deno.json`)
  ) {
    root = getFrameworkRoot();
  }
  const violations: string[] = [];
  const forbiddenFiles = [
    "package.json",
    "package-lock.json",
    "node_modules",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",
  ];

  for (const f of forbiddenFiles) {
    if (existsSync(`${root}/${f}`)) {
      violations.push(`Forbidden file or directory detected: ${f}`);
    }
  }

  // Check code files for npm: specifiers or Node-only imports
  async function scanDir(dir: string) {
    for await (const entry of Deno.readDir(dir)) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory) {
        if (
          entry.name !== ".git" && entry.name !== "dist" && entry.name !== "bin"
        ) {
          await scanDir(full);
        }
      } else if (
        entry.isFile &&
        (entry.name.endsWith(".ts") || entry.name.endsWith(".js") ||
          entry.name.endsWith(".json"))
      ) {
        try {
          const normFull = full.replaceAll("\\", "/");
          if (!normFull.endsWith("Core/cli/doctor.ts")) {
            const forbiddenPrefix = String.fromCharCode(110, 112, 109, 58); // "n" + "p" + "m" + ":"
            const content = await Deno.readTextFile(full);
            if (content.includes(forbiddenPrefix)) {
              violations.push(
                `Forbidden '${forbiddenPrefix}' specifier found in: ${full}`,
              );
            }
          }
        } catch {
          // ignore binary / unreadable
        }
      }
    }
  }

  await scanDir(root);

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Comprehensive doctor diagnostic suite.
 */
export async function runDoctor(
  options: { denoOnly?: boolean; json?: boolean } = {},
): Promise<DoctorReport> {
  const checks: DoctorReport["checks"] = [];
  let allPass = true;

  // 1. Deno-only Tripwire
  const tripwire = await runDenoOnlyTripwire();
  if (tripwire.passed) {
    checks.push({
      name: "Deno-Only Purity Tripwire",
      status: "PASS",
      message: "No forbidden Node/npm artifacts or specifiers found.",
    });
  } else {
    allPass = false;
    checks.push({
      name: "Deno-Only Purity Tripwire",
      status: "FAIL",
      message: tripwire.violations.join("; "),
    });
  }

  if (options.denoOnly) {
    if (!options.json) {
      console.log(
        tripwire.passed
          ? "✔ Tripwire check PASS: Clean Deno environment."
          : `✖ Tripwire check FAIL:\n${tripwire.violations.join("\n")}`,
      );
    }
    if (!tripwire.passed) Deno.exit(1);
    return {
      denoOnlyPassed: tripwire.passed,
      denoVersion: Deno.version.deno,
      gccVersion: "N/A",
      osVersion: `${Deno.build.os} ${Deno.build.arch}`,
      rwaCmdPath: null,
      checks,
    };
  }

  // 2. Deno Version Check
  checks.push({
    name: "Deno Version",
    status: "PASS",
    message:
      `Deno ${Deno.version.deno} (v8 ${Deno.version.v8}, TypeScript ${Deno.version.typescript})`,
  });

  // 3. GCC / MinGW-w64 Check
  let gccVer = "Not Found";
  try {
    const cmd = new Deno.Command("gcc", {
      args: ["--version"],
      stdout: "piped",
      stderr: "piped",
    });
    const output = await cmd.output();
    if (output.success) {
      const text = new TextDecoder().decode(output.stdout).split("\n")[0] || "";
      gccVer = text.trim();
      checks.push({
        name: "MinGW-w64 GCC Compiler",
        status: "PASS",
        message: gccVer,
      });
    } else {
      allPass = false;
      checks.push({
        name: "MinGW-w64 GCC Compiler",
        status: "FAIL",
        message: "gcc exited with non-zero code.",
      });
    }
  } catch (err) {
    allPass = false;
    checks.push({
      name: "MinGW-w64 GCC Compiler",
      status: "FAIL",
      message: `gcc command not found on PATH: ${(err as Error).message}`,
    });
  }

  // 4. Windows Operating System & Architecture
  const isWindows = Deno.build.os === "windows";
  checks.push({
    name: "Target Operating System",
    status: isWindows ? "PASS" : "NOT VERIFIED",
    message: `OS: ${Deno.build.os}, Arch: ${Deno.build.arch}`,
  });

  // 5. WebView2Loader.dll Vendored Binary
  const fwRoot = getFrameworkRoot();
  const loaderPath = `${fwRoot}/Core/runtime/webui/lib/WebView2Loader.dll`
    .replaceAll("\\", "/");
  if (existsSync(loaderPath)) {
    checks.push({
      name: "WebView2Loader Library",
      status: "PASS",
      message: `Found embedded source at ${loaderPath}`,
    });
  } else {
    allPass = false;
    checks.push({
      name: "WebView2Loader Library",
      status: "FAIL",
      message: `Missing required file at ${loaderPath}`,
    });
  }

  // 6. rwa command discovery
  let rwaPath: string | null = null;
  try {
    const cmd = new Deno.Command("where.exe", {
      args: ["rwa"],
      stdout: "piped",
      stderr: "piped",
    });
    const output = await cmd.output();
    if (output.success) {
      rwaPath =
        new TextDecoder().decode(output.stdout).trim().split("\r\n")[0] || null;
      checks.push({
        name: "Global 'rwa' Command Resolution",
        status: "PASS",
        message: `Resolves to: ${rwaPath}`,
      });
    } else {
      checks.push({
        name: "Global 'rwa' Command Resolution",
        status: "NOT VERIFIED",
        message:
          "Not registered on system PATH yet (run 'rwa setup' or 'deno task setup').",
      });
    }
  } catch {
    checks.push({
      name: "Global 'rwa' Command Resolution",
      status: "NOT VERIFIED",
      message: "Unable to execute where.exe on this host.",
    });
  }

  const report: DoctorReport = {
    denoOnlyPassed: tripwire.passed,
    denoVersion: Deno.version.deno,
    gccVersion: gccVer,
    osVersion: `${Deno.build.os} ${Deno.build.arch}`,
    rwaCmdPath: rwaPath,
    checks,
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      "\n================ RitaWapp Doctor Diagnostics ================",
    );
    for (const c of checks) {
      const badge = c.status === "PASS"
        ? "✔ PASS"
        : c.status === "FAIL"
        ? "✖ FAIL"
        : "○ NOT VERIFIED";
      console.log(`[${badge}] ${c.name}: ${c.message}`);
    }
    console.log(
      "=============================================================\n",
    );
  }

  if (!allPass) {
    Deno.exit(1);
  }

  return report;
}

if (import.meta.main) {
  const isDenoOnly = Deno.args.includes("--deno-only");
  const isJson = Deno.args.includes("--json");
  await runDoctor({ denoOnly: isDenoOnly, json: isJson });
}
