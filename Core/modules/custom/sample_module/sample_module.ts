/**
 * ============================================================================
 * ritawapp-modules/sample_module/sample_module.ts
 * ============================================================================
 * TypeScript wrapper for sample_module
 * ============================================================================
 */

import { callRitaModule } from "../../../client/vue/rpc.ts";

export interface SampleInfo {
  module: string;
  version: string;
  type: string;
}

export const sampleModule = {
  async greet(name: string): Promise<string> {
    const res = await callRitaModule("sample_module", "greet", { name });
    if (!res.success) throw new Error(res.error || "greet failed");
    return res.message;
  },

  async addNumbers(a: number, b: number): Promise<number> {
    const res = await callRitaModule("sample_module", "addNumbers", { a, b });
    if (!res.success) throw new Error(res.error || "addNumbers failed");
    return res.result;
  },

  async getInfo(): Promise<SampleInfo> {
    const res = await callRitaModule("sample_module", "getInfo");
    if (!res.success) throw new Error(res.error || "getInfo failed");
    return {
      module: res.module,
      version: res.version,
      type: res.type,
    };
  },
};

export default sampleModule;
