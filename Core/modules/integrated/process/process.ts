/**
 * ============================================================================
 * RDevCore/modules/integrated/process/process.ts
 * ============================================================================
 * Node.js-compatible 'process' module for RitaWapp
 * ============================================================================
 */

import { rpc } from "../../../client/vue/rpc.ts";

let cachedProcess: any = null;

async function getCachedProcess() {
  if (!cachedProcess) {
    cachedProcess = await rpc("process", "getInfo");
  }
  return cachedProcess;
}

export const process = {
  platform: "win32",
  arch: "x64",

  async getPid(): Promise<number> {
    const data = await getCachedProcess();
    return data.pid || 0;
  },

  async cwd(): Promise<string> {
    return await rpc("process", "cwd");
  },

  async memoryUsage(): Promise<
    { rss: number; heapTotal: number; heapUsed: number }
  > {
    const data = await rpc("process", "getInfo");
    return data.memoryUsage;
  },

  async env(key?: string): Promise<any> {
    if (key) {
      return await rpc("process", "getEnv", key);
    }
    return {
      NODE_ENV: "production",
      RITAWAPP_RUNTIME: "1",
    };
  },

  async exit(code: number = 0): Promise<void> {
    await rpc("process", "exit", code);
  },
};

export default process;
