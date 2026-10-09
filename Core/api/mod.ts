/**
 * RitaWapp Public API Definitions
 */

export * from "../config/config.ts";
export * from "../cli/doctor.ts";
export * from "../cli/setup.ts";
export * from "../cli/logger.ts";
export * from "../cli/errors.ts";
export * from "../toolchain/paths.ts";
export * from "../modules/integrated/registry.ts";
export * from "../wsapi/protocol.ts";
export * from "../wsapi/server.ts";
export * from "../wsapi/auth.ts";

// Public Module Types & Functions
export type { ModuleName, RitaWappConfig, TrayItem } from "../config/config.ts";
export type { DoctorReport } from "../cli/doctor.ts";
export type { ModuleManifest } from "../modules/integrated/registry.ts";
export type {
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
} from "../wsapi/protocol.ts";
