/**
 * ============================================================================
 * RDevCore/modules/integrated/fs/fs.ts
 * ============================================================================
 * Node.js-compatible 'fs' module for RitaWapp
 * ============================================================================
 */

import { rpc } from "../../../client/vue/rpc.ts";

export interface FileStat {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
}

export const fs = {
  async readFile(
    filePath: string,
    encoding: string = "utf-8",
  ): Promise<string> {
    return await rpc("fs", "readFile", filePath, encoding);
  },

  async writeFile(
    filePath: string,
    content: string,
  ): Promise<{ bytesWritten: number }> {
    return await rpc("fs", "writeFile", filePath, content);
  },

  async appendFile(filePath: string, content: string): Promise<boolean> {
    return await rpc("fs", "appendFile", filePath, content);
  },

  async exists(filePath: string): Promise<boolean> {
    return await rpc("fs", "exists", filePath);
  },

  async readdir(dirPath: string): Promise<string[]> {
    return await rpc("fs", "readdir", dirPath);
  },

  async mkdir(dirPath: string): Promise<boolean> {
    return await rpc("fs", "mkdir", dirPath);
  },

  async unlink(filePath: string): Promise<boolean> {
    return await rpc("fs", "unlink", filePath);
  },

  async rm(filePath: string): Promise<boolean> {
    return await rpc("fs", "rm", filePath);
  },

  async copyFile(src: string, dest: string): Promise<boolean> {
    return await rpc("fs", "copyFile", src, dest);
  },

  async rename(oldPath: string, newPath: string): Promise<boolean> {
    return await rpc("fs", "rename", oldPath, newPath);
  },

  async stat(filePath: string): Promise<FileStat> {
    return await rpc("fs", "stat", filePath);
  },

  async getAppDir(): Promise<string> {
    return await rpc("fs", "getAppDir");
  },

  promises: null as any,
};

fs.promises = fs;
export default fs;
