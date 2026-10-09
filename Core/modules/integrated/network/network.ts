/**
 * ============================================================================
 * RDevCore/modules/integrated/network/network.ts
 * ============================================================================
 * Network, Connectivity & Wi-Fi Management module for RitaWapp
 * ============================================================================
 */

import { rpc } from "../../../client/vue/rpc.ts";
import { shell } from "../shell/shell.ts";

export interface NetworkInterface {
  name: string;
  ip: string;
  type: string;
}

export const network = {
  async isOnline(): Promise<boolean> {
    return await rpc("network", "isOnline");
  },

  async getInterfaces(): Promise<NetworkInterface[]> {
    return await rpc("network", "getInterfaces");
  },

  async getWifiStatus(): Promise<
    { connected: boolean; ssid?: string; signal?: number }
  > {
    const online = await this.isOnline();
    return {
      connected: online,
      ssid: online ? "Connected Network" : "Disconnected",
      signal: online ? 100 : 0,
    };
  },

  async ping(
    host: string = "8.8.8.8",
  ): Promise<
    { ok: boolean; latencyMs: number; alive: boolean; timeMs: number }
  > {
    try {
      const res = await rpc("network", "ping", host);
      if (res && typeof res === "object") {
        const ok = Boolean(res.ok ?? res.alive ?? false);
        const latencyMs = Number(res.latencyMs ?? res.timeMs ?? 0);
        return {
          ok,
          latencyMs,
          alive: ok,
          timeMs: latencyMs,
        };
      }
    } catch {
      // Fallback to shell ping
    }
    try {
      const t0 = performance.now();
      const res = await shell.exec(`ping -n 1 -w 1000 ${host}`);
      const latency = Math.round(performance.now() - t0);
      const ok = res.exitCode === 0;
      return {
        ok,
        latencyMs: latency,
        alive: ok,
        timeMs: latency,
      };
    } catch {
      return { ok: false, latencyMs: 0, alive: false, timeMs: 0 };
    }
  },

  async getPublicIP(): Promise<string> {
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      const data = await res.json();
      return data.ip;
    } catch {
      return "127.0.0.1";
    }
  },
};

export default network;
