/**
 * ============================================================================
 * RDevCore/client/vue/rpc.ts
 * ============================================================================
 * High-Performance Asynchronous RPC Bridge between JS/TS and Native C Runtime
 * ============================================================================
 */

import { isModuleEnabled } from "./ritawapp.modules.ts";

let _cachedNativeBridge: ((payload: string) => Promise<string>) | null = null;
let _bridgeUnavailable = false;
let _lastProbeTime = 0;
let _startupProbePromise: Promise<((payload: string) => Promise<string>) | null> | null = null;

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

async function ensureRpcReady(): Promise<((payload: string) => Promise<string>) | null> {
  if (_cachedNativeBridge) return _cachedNativeBridge;

  let fn = getNativeBridge();
  if (fn) {
    _cachedNativeBridge = fn;
    _bridgeUnavailable = false;
    if (typeof window !== "undefined") {
      (window as any).__RWA_RPC_MODE__ = "native";
    }
    return fn;
  }

  // If already marked unavailable, probe at most once every 2 seconds without waiting
  if (_bridgeUnavailable) {
    const now = Date.now();
    if (now - _lastProbeTime >= 2000) {
      _lastProbeTime = now;
      fn = getNativeBridge();
      if (fn) {
        _cachedNativeBridge = fn;
        _bridgeUnavailable = false;
        if (typeof window !== "undefined") {
          (window as any).__RWA_RPC_MODE__ = "native";
        }
        return fn;
      }
    }
    if (typeof window !== "undefined") {
      (window as any).__RWA_RPC_MODE__ = "unavailable";
    }
    return null;
  }

  // Initial startup probe (max 3000 ms, poll every 25 ms)
  if (!_startupProbePromise) {
    _startupProbePromise = (async () => {
      const start = Date.now();
      while (Date.now() - start < 3000) {
        fn = getNativeBridge();
        if (fn) {
          _cachedNativeBridge = fn;
          _bridgeUnavailable = false;
          if (typeof window !== "undefined") {
            (window as any).__RWA_RPC_MODE__ = "native";
          }
          return fn;
        }
        await new Promise((r) => setTimeout(r, 25));
      }

      _bridgeUnavailable = true;
      _lastProbeTime = Date.now();
      if (typeof window !== "undefined") {
        (window as any).__RWA_RPC_MODE__ = "unavailable";
      }
      return null;
    })();
  }

  const res = await _startupProbePromise;
  return res;
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
    throw new Error("Native bridge not connected");
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
