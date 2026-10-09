/**
 * ============================================================================
 * Core/cli/errors.ts
 * ============================================================================
 * RitaWapp Robust CLI Error Handling Architecture
 * Provides typed domain errors, actionable remediation suggestions,
 * and clean terminal diagnostic formatting.
 * ============================================================================
 */

import { bold, cyan, dim, red, yellow } from "jsr:@std/fmt@1.0.6/colors";

export class RitaError extends Error {
  public readonly code: string;
  public readonly suggestion?: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    options: { code?: string; suggestion?: string; details?: unknown } = {},
  ) {
    super(message);
    this.name = "RitaError";
    this.code = options.code || "ERR_RITAWAPP";
    this.suggestion = options.suggestion;
    this.details = options.details;
  }
}

export class ConfigError extends RitaError {
  constructor(message: string, suggestion?: string, details?: unknown) {
    super(message, {
      code: "ERR_CONFIG",
      suggestion: suggestion ||
        "Verify your RitaWapp.json or RitaWapp.config.ts matches framework schema.",
      details,
    });
    this.name = "ConfigError";
  }
}

export class BuildError extends RitaError {
  constructor(message: string, suggestion?: string, details?: unknown) {
    super(message, {
      code: "ERR_BUILD",
      suggestion: suggestion ||
        "Ensure MinGW-w64 GCC is in PATH and required C toolchain dependencies exist.",
      details,
    });
    this.name = "BuildError";
  }
}

export class RuntimeError extends RitaError {
  constructor(message: string, suggestion?: string, details?: unknown) {
    super(message, {
      code: "ERR_RUNTIME",
      suggestion: suggestion ||
        "Verify application output binaries and permissions.",
      details,
    });
    this.name = "RuntimeError";
  }
}

/**
 * Global CLI error handler.
 * Prints structured error output and exits cleanly without unhandled rejections.
 */
export function handleCliError(error: unknown, exit: boolean = true): void {
  const isDebug = Deno.env.get("DEBUG") === "1" ||
    Deno.args.includes("--debug") || Deno.args.includes("--verbose");

  console.error("");
  if (error instanceof RitaError) {
    console.error(red(bold(`✖ [${error.code}] ${error.message}`)));
    if (error.suggestion) {
      console.error(yellow(`  Suggestion: `) + error.suggestion);
    }
    if (error.details && isDebug) {
      console.error(
        dim(`  Details: ${JSON.stringify(error.details, null, 2)}`),
      );
    }
  } else if (error instanceof Error) {
    console.error(red(bold(`✖ Error: ${error.message}`)));
    if (isDebug && error.stack) {
      console.error(dim(error.stack));
    } else {
      console.error(dim(`  Run with --debug for stack trace.`));
    }
  } else {
    console.error(red(bold(`✖ Unknown error: ${String(error)}`)));
  }
  console.error("");

  if (exit) {
    Deno.exit(1);
  }
}
