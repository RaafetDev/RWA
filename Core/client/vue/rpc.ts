/**
 * ============================================================================
 * RDevCore/client/vue/rpc.ts
 * ============================================================================
 * High-Performance Asynchronous RPC Bridge between JS/TS and Native C Runtime
 * ============================================================================
 */

import { isModuleEnabled } from "./ritawapp.modules.ts";

let _warnedFallback = false;

function getNativeBridge(): ((payload: string) => Promise<string>) | null {
  const g = typeof window !== "undefined" ? (window as any) : (globalThis as any);
  const fn = g.rita_module_call || g.rita_bridge_call || g.webui?.rita_module_call;
  if (typeof fn === "function") return fn;

  const w = g.webui;
  if (
    w &&
    typeof w.call === "function" &&
    typeof w.isConnected === "function" &&
    w.isConnected()
  ) {
    return async (payload: string) => {
      if (typeof g.rita_module_call === "function") {
        return g.rita_module_call(payload);
      }
      return w.call("rita_module_call", payload);
    };
  }
  return null;
}

async function ensureRpcReady(
  timeoutMs = 8000,
): Promise<((payload: string) => Promise<string>) | null> {
  let fn = getNativeBridge();
  if (fn) {
    if (typeof window !== "undefined") {
      (window as any).__RWA_RPC_MODE__ = "native";
    }
    return fn;
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 25));
    fn = getNativeBridge();
    if (fn) {
      if (typeof window !== "undefined") {
        (window as any).__RWA_RPC_MODE__ = "native";
      }
      return fn;
    }
  }

  if (typeof window !== "undefined") {
    (window as any).__RWA_RPC_MODE__ = "MOCK";
  }
  if (!_warnedFallback) {
    _warnedFallback = true;
    console.warn(
      "[RitaWapp Mock] Native C module bridge not detected after timeout. Falling back to HTTP dev mock.",
    );
  }

  if (typeof location !== "undefined" && location.origin) {
    return async (payload: string) => {
      const res = await fetch("/_rwa_rpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      return await res.text();
    };
  }

  return null;
}

export async function rpc(
  module: string,
  action: string,
  ...args: any[]
): Promise<any> {
  if (!isModuleEnabled(module)) {
    throw new Error(
      `[RitaWapp RPC] Module '${module}' is disabled in RitaWapp-config.ts`,
    );
  }
  const payload = JSON.stringify({ module, action, args });

  const bridgeFn = await ensureRpcReady();

  if (typeof bridgeFn !== "function") {
    if (typeof window !== "undefined") {
      (window as any).__RWA_RPC_MODE__ = "MOCK";
    }
    if (!_warnedFallback) {
      _warnedFallback = true;
      console.warn(
        `[RitaWapp RPC] Native bridge not detected for ${module}.${action}. Falling back to browser polyfill.`,
      );
    }
    return null;
  }

  try {
    const rawResult: string = await bridgeFn(payload);
    if (typeof rawResult === "string") {
      try {
        const parsed = JSON.parse(rawResult);
        if (parsed && typeof parsed === "object" && "success" in parsed) {
          if (parsed.success) {
            return parsed.data !== undefined ? parsed.data : parsed;
          }
          throw new Error(parsed.error || `RPC failed in ${module}.${action}`);
        }
        return parsed;
      } catch (jsonErr: any) {
        if (jsonErr.message?.includes("RPC failed in")) throw jsonErr;
        return rawResult;
      }
    }
    return rawResult;
  } catch (err: any) {
    console.error(`[RitaWapp RPC Error] ${module}.${action}:`, err);
    throw err;
  }
}

// Alias for module invocations
export const callRitaModule = rpc;
export default rpc;
