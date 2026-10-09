/**
 * ============================================================================
 * Core/cli/logger.ts
 * ============================================================================
 * RitaWapp High-Performance Structured Logger
 * Built exclusively using Deno standard library (pure Deno / JSR).
 * ============================================================================
 */

import {
  blue,
  bold,
  cyan,
  dim,
  gray,
  green,
  magenta,
  red,
  yellow,
} from "jsr:@std/fmt@1.0.6/colors";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

class RitaLogger {
  private level: LogLevel = "info";

  constructor() {
    if (
      Deno.env.get("DEBUG") === "1" || Deno.args.includes("--debug") ||
      Deno.args.includes("--verbose")
    ) {
      this.level = "debug";
    }
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  debug(msg: string, ...args: unknown[]) {
    if (this.level !== "debug") return;
    console.log(gray(`[DEBUG] ${msg}`), ...args);
  }

  info(msg: string, ...args: unknown[]) {
    if (this.level === "silent") return;
    console.log(cyan(`[RitaWapp] `) + msg, ...args);
  }

  success(msg: string, ...args: unknown[]) {
    if (this.level === "silent") return;
    console.log(green(`✔ `) + bold(msg), ...args);
  }

  warn(msg: string, ...args: unknown[]) {
    if (this.level === "silent") return;
    console.warn(yellow(`⚠ `) + yellow(msg), ...args);
  }

  error(msg: string, ...args: unknown[]) {
    if (this.level === "silent") return;
    console.error(red(`✖ `) + red(bold(msg)), ...args);
  }

  step(current: number, total: number, msg: string) {
    if (this.level === "silent") return;
    const progress = magenta(`[${current}/${total}]`);
    console.log(`${progress} ${msg}`);
  }

  banner(title: string, subtitle?: string) {
    if (this.level === "silent") return;
    const line = "═".repeat(60);
    console.log(cyan(line));
    console.log(bold(cyan(`  ${title}`)));
    if (subtitle) {
      console.log(dim(`  ${subtitle}`));
    }
    console.log(cyan(line));
  }

  divider() {
    if (this.level === "silent") return;
    console.log(dim("─".repeat(60)));
  }
}

export const logger = new RitaLogger();
export default logger;
