/**
 * ============================================================================
 * RDevCore/client/vue/rpc.ts
 * ============================================================================
 * High-Performance Asynchronous RPC Bridge between JS/TS and Native C Runtime
 * ============================================================================
 */

import { isModuleEnabled } from "./ritawapp.modules.ts";

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

  const g = typeof globalThis !== "undefined" ? (globalThis as any) : {};
  const bridgeFn = g.rita_module_call ||
    g.rita_bridge_call ||
    g.webui?.rita_module_call;

  if (typeof bridgeFn !== "function") {
    // Graceful in-browser dev fallback or connection queue
    return new Promise((resolve, reject) => {
      let retries = 0;
      const interval = setInterval(() => {
        retries++;
        const fn = g.rita_module_call ||
          g.rita_bridge_call ||
          g.webui?.rita_module_call;

        if (typeof fn === "function") {
          clearInterval(interval);
          fn(payload)
            .then((raw: string) => {
              try {
                const parsed = JSON.parse(raw);
                if (parsed.success) {
                  resolve(parsed.data !== undefined ? parsed.data : parsed);
                } else reject(new Error(parsed.error || "Native RPC failed"));
              } catch {
                resolve(raw);
              }
            })
            .catch(reject);
        } else if (retries > 30) {
          clearInterval(interval);
          console.warn(
            `[RitaWapp RPC] Native bridge not detected for ${module}.${action}. Falling back to browser polyfill.`,
          );
          resolve(null);
        }
      }, 50);
    });
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
