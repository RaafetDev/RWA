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
  if (typeof window.rita_module_call !== "function") {
    throw new Error("RitaWapp RPC bridge (rita_module_call) is not available.");
  }

  const payload = JSON.stringify({
    module: "myModule",
    action,
    args,
  });

  const responseRaw = await window.rita_module_call(payload);
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
