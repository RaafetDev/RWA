/**
 * ============================================================================
 * RDevCore/modules/integrated/os/os.ts
 * ============================================================================
 * Node.js-compatible 'os' module for RitaWapp with Hardware Fingerprinting
 * ============================================================================
 */

import { rpc } from "../../../client/vue/rpc.ts";

export interface OsInfo {
  platform: string;
  arch: string;
  hostname: string;
  cpuCount: number;
  uptime: number;
  totalmem: number;
  freemem: number;
  homedir: string;
  tmpdir: string;
  cpuid: string;
  harddriveId: string;
  motherboardId: string;
  fingerprint: string;
}

let cachedOs: OsInfo | null = null;

async function getCachedOs(): Promise<OsInfo> {
  if (!cachedOs) {
    cachedOs = await rpc("os", "getInfo");
  }
  return cachedOs!;
}

export const os = {
  async getInfo(forceRefresh = false): Promise<OsInfo> {
    if (forceRefresh || !cachedOs) {
      cachedOs = await rpc("os", "getInfo");
    }
    return cachedOs!;
  },

  async platform(): Promise<string> {
    const data = await getCachedOs();
    return data.platform || "win32";
  },

  async arch(): Promise<string> {
    const data = await getCachedOs();
    return data.arch || "x64";
  },

  async hostname(): Promise<string> {
    const data = await getCachedOs();
    return data.hostname || "localhost";
  },

  async uptime(): Promise<number> {
    const data = await getCachedOs();
    return data.uptime || 0;
  },

  async totalmem(): Promise<number> {
    const data = await getCachedOs();
    return data.totalmem || 16 * 1024 * 1024 * 1024;
  },

  async freemem(): Promise<number> {
    const data = await getCachedOs();
    return data.freemem || 8 * 1024 * 1024 * 1024;
  },

  async homedir(): Promise<string> {
    const data = await getCachedOs();
    return data.homedir || "C:\\Users";
  },

  async tmpdir(): Promise<string> {
    const data = await getCachedOs();
    return data.tmpdir || "C:\\Temp";
  },

  async cpus(): Promise<
    Array<{ model: string; speed: number; count: number }>
  > {
    const data = await getCachedOs();
    return [{
      model: "Native Processor",
      speed: 3200,
      count: data.cpuCount || 8,
    }];
  },

  /**
   * Retrieves processor hardware identification signature (CPUID).
   * Example: "BFEBFBFF000306A9"
   */
  async cpuid(): Promise<string> {
    const data = await getCachedOs();
    return data.cpuid || (await rpc("os", "cpuid"));
  },
  async cpuId(): Promise<string> {
    return await this.cpuid();
  },

  /**
   * Retrieves physical hard drive hardware serial number (with volume serial fallback).
   * Example: "NAYJ27A20A02918" or "3CF2-9124"
   */
  async harddriveId(): Promise<string> {
    const data = await getCachedOs();
    return data.harddriveId || (await rpc("os", "harddriveId"));
  },
  async hardDriveId(): Promise<string> {
    return await this.harddriveId();
  },
  async diskId(): Promise<string> {
    return await this.harddriveId();
  },

  /**
   * Retrieves motherboard / system baseboard UUID and model identifier.
   * Example: "H61M-S2PT-03AA02FC-0414-054F-1106-170700080009"
   */
  async motherboardId(): Promise<string> {
    const data = await getCachedOs();
    return data.motherboardId || (await rpc("os", "motherboardId"));
  },
  async motherBoardId(): Promise<string> {
    return await this.motherboardId();
  },

  /**
   * Generates a permanent, cryptographically solid SHA-256 unique hardware machine identity.
   * Based on CPU ID, Hard Drive ID, Motherboard ID, and Windows MachineGuid.
   * Example: "2170f8c8a6bdf09f0935cafe7d0e15fb99fdd15e4f86577454552654abea702d"
   */
  async fingerprint(): Promise<string> {
    const data = await getCachedOs();
    return data.fingerprint || (await rpc("os", "fingerprint"));
  },
  async machineId(): Promise<string> {
    return await this.fingerprint();
  },

  async networkInterfaces(): Promise<any> {
    return await rpc("network", "getInterfaces");
  },

  EOL: "\r\n",
};

export default os;
