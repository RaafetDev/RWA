/**
 * ============================================================================
 * RDevCore/modules/integrated/cloudSync/cloudSync.ts
 * ============================================================================
 * Cloud Synchronization module for RitaWapp
 * ============================================================================
 */

import { rpc } from "../../../client/vue/rpc.ts";

export const cloudSync = {
  async sync(): Promise<{ status: string; lastSync: number }> {
    return await rpc("cloudSync", "sync");
  },

  async getStatus(): Promise<{ connected: boolean; pendingItems: number }> {
    return await rpc("cloudSync", "getStatus");
  },
};

export default cloudSync;
