/**
 * ============================================================================
 * RDevCore/modules/integrated/shell/shell.ts
 * ============================================================================
 * Shell & Process Execution module for RitaWapp
 * ============================================================================
 */

import { rpc } from "../../../client/vue/rpc.ts";

export interface ShellExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export const shell = {
  async exec(command: string): Promise<ShellExecResult> {
    return await rpc("shell", "exec", command);
  },

  async spawn(command: string, args: string[] = []): Promise<ShellExecResult> {
    const fullCmd = `${command} ${args.join(" ")}`;
    return await rpc("shell", "exec", fullCmd);
  },

  async openExternal(urlOrPath: string): Promise<boolean> {
    return await rpc("shell", "openExternal", urlOrPath);
  },

  async showItemInFolder(filePath: string): Promise<boolean> {
    return await rpc("shell", "showItemInFolder", filePath);
  },
};

export default shell;
