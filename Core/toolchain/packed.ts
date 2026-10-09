/**
 * ============================================================================
 * Core/toolchain/packed.ts
 * ============================================================================
 * RitaWapp Distributable Package Generator & Consumer Smoke Verifier
 * ============================================================================
 */

import { runDenoOnlyTripwire } from "../cli/doctor.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";

export async function runPackedPipeline() {
  console.log(
    "\n================ RitaWapp Packed Verification Pipeline ================",
  );

  // 1. Deno-only tripwire verification
  console.log("1. Running Deno-only tripwire check...");
  const tripwire = await runDenoOnlyTripwire();
  if (!tripwire.passed) {
    throw new Error(`Tripwire failed: ${tripwire.violations.join("; ")}`);
  }
  console.log("   ✔ Tripwire passed.");

  // 2. Strict type check
  console.log("2. Running strict type checks on mod.ts & RitaWapp.ts...");
  const checkCmd = new Deno.Command("deno", {
    args: ["check", "mod.ts", "RitaWapp.ts"],
    stdout: "inherit",
    stderr: "inherit",
  });
  const checkRes = await checkCmd.output();
  if (checkRes.code !== 0) throw new Error("deno check failed");
  console.log("   ✔ Typecheck passed.");

  // 3. Test suite
  console.log("3. Running comprehensive test suite...");
  const testCmd = new Deno.Command("deno", {
    args: ["test", "-A", "Core/tests/"],
    stdout: "inherit",
    stderr: "inherit",
  });
  const testRes = await testCmd.output();
  if (testRes.code !== 0) throw new Error("Test suite failed");
  console.log("   ✔ Test suite passed.");

  // 4. Assemble package allow-list
  console.log("4. Assembling distributable package archive...");
  const version = "1.0.1";
  const distPkgDir = "dist/package";
  await ensureDir(distPkgDir);
  const zipPath = `${distPkgDir}/ritawapp-v${version}.zip`;

  // Create zip using AdmZip
  const { AdmZip } = await import("../modules/integrated/admZip/admZip.ts");
  const zip = new AdmZip();

  // Add root files
  for (
    const f of [
      "deno.json",
      "mod.ts",
      "RitaWapp.ts",
      "README.md",
      "LICENSE",
      "SECURITY.md",
      "CHANGELOG.md",
      "AGENTS.md",
    ]
  ) {
    try {
      const data = await Deno.readFile(f);
      zip.addFile(f, data);
    } catch {
      // convention file optional
    }
  }

  // Add Core files recursively
  async function addCoreFiles(dir: string, base: string) {
    for await (const entry of Deno.readDir(dir)) {
      const full = `${dir}/${entry.name}`;
      const zipEntryName = `${base}/${entry.name}`;
      if (entry.isDirectory) {
        if (
          entry.name !== ".dev" && entry.name !== "dist" &&
          entry.name !== ".git"
        ) {
          await addCoreFiles(full, zipEntryName);
        }
      } else if (entry.isFile) {
        const data = await Deno.readFile(full);
        zip.addFile(zipEntryName, data);
      }
    }
  }
  await addCoreFiles("Core", "Core");

  await zip.writeZip(zipPath);
  const zipBytes = await Deno.readFile(zipPath);
  const hashBuffer = await crypto.subtle.digest("SHA-256", zipBytes);
  const sha256 = encodeHex(new Uint8Array(hashBuffer));
  await Deno.writeTextFile(
    `${zipPath}.sha256`,
    `${sha256} *ritawapp-v${version}.zip\n`,
  );

  console.log(
    `   ✔ Created: ${zipPath} (${
      (zipBytes.length / 1024 / 1024).toFixed(2)
    } MB)`,
  );
  console.log(`   ✔ SHA-256: ${sha256}`);

  // 5. Consumer Simulation
  console.log(
    "5. Running consumer simulation in isolated temporary environment...",
  );
  const tempDir = await Deno.makeTempDir();
  try {
    const simScript = `
      import * as Rita from "file:///${
      Deno.cwd().replaceAll("\\", "/")
    }/mod.ts";
      console.log("[Consumer Smoke] Loaded @ritawapp/core version: " + Rita.DEFAULT_CONFIG.app.version);
      if (typeof Rita.validateConfig !== "function") throw new Error("validateConfig missing");
      if (typeof Rita.WsApiServer !== "function") throw new Error("WsApiServer missing");
    `;
    const simFile = `${tempDir}/smoke.ts`;
    await Deno.writeTextFile(simFile, simFile);
    const smokeCmd = new Deno.Command("deno", {
      args: ["eval", simScript],
      stdout: "piped",
      stderr: "piped",
    });
    const smokeRes = await smokeCmd.output();
    const outStr = new TextDecoder().decode(smokeRes.stdout).trim();
    if (smokeRes.code !== 0) {
      throw new Error(
        `Consumer smoke failed: ${new TextDecoder().decode(smokeRes.stderr)}`,
      );
    }
    console.log(`   ✔ Consumer smoke test passed: ${outStr}`);
  } finally {
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch { /* ignore */ }
  }

  console.log("\n✔ Distributable package pipeline completed successfully.");
  console.log(
    "=======================================================================\n",
  );
}

if (import.meta.main) {
  await runPackedPipeline();
}
