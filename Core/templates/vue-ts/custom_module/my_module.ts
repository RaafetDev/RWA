/**
 * ============================================================================
 * custom_module/my_module.ts
 * ============================================================================
 * TypeScript wrapper for the custom native C module 'myModule'.
 * Provides type-safe functions for Vue 3 components.
 * ============================================================================
 */

export interface HelloResponse {
  message: string;
  version: string;
}

export interface SystemTicksResponse {
  tickCount: number;
}

/**
 * Invokes an action on a native module via RitaWapp RPC bridge.
 */
async function callCustomModule<T>(action: string, args: unknown[] = []): Promise<T> {
  const g = typeof window !== "undefined" ? (window as any) : (globalThis as any);
  let fn = g.rita_module_call || g.rita_bridge_call || g.webui?.rita_module_call;
  if (typeof fn !== "function") {
    const start = Date.now();
    while (Date.now() - start < 3000) {
      await new Promise((r) => setTimeout(r, 20));
      fn = g.rita_module_call || g.rita_bridge_call || g.webui?.rita_module_call;
      if (typeof fn === "function") break;
    }
  }
  if (typeof fn !== "function") {
    throw new Error("RitaWapp RPC bridge (rita_module_call) is not available.");
  }

  const payload = JSON.stringify({
    module: "myModule",
    action,
    args,
  });

  const responseRaw = await fn(payload);
  const res = JSON.parse(responseRaw);

  if (!res.success) {
    throw new Error(res.error || `Custom module call '${action}' failed.`);
  }

  return res.data as T;
}

export const myModule = {
  /**
   * Calls the native 'hello' action in C.
   */
  async hello(): Promise<HelloResponse> {
    return await callCustomModule<HelloResponse>("hello");
  },

  /**
   * Calls the native 'addNumbers' computation in C.
   */
  async addNumbers(a: number, b: number): Promise<{ result: number }> {
    return await callCustomModule<{ result: number }>("addNumbers", [a, b]);
  },

  /**
   * Calls Win32 GetTickCount() directly in C.
   */
  async getSystemTicks(): Promise<SystemTicksResponse> {
    return await callCustomModule<SystemTicksResponse>("getSystemTicks");
  },
};
