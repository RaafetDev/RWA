/**
 * ============================================================================
 * RDevCore/client/vue/ritawapp.d.ts
 * ============================================================================
 * RitaWapp TypeScript Global Type Declarations
 * ============================================================================
 */

import type { RitaWapp as RitaWappPlugin } from "./RitaWapp";
import type {
  appWindow as AppWindowModule,
  cloudSync as CloudSyncModule,
  db as DbModule,
  fs as FsModule,
  mongoose as MongooseModule,
  network as NetworkModule,
  os as OsModule,
  path as PathModule,
  process as ProcessModule,
  shell as ShellModule,
  update as UpdateModule,
  webUI as WebUIModule,
} from "./RitaWapp";

declare global {
  const fs: typeof FsModule;
  const os: typeof OsModule;
  const path: typeof PathModule;
  const process: typeof ProcessModule;
  const shell: typeof ShellModule;
  const appWindow: typeof AppWindowModule;
  const webUI: typeof WebUIModule;
  const network: typeof NetworkModule;
  const mongoose: typeof MongooseModule;
  const db: typeof DbModule;
  const update: typeof UpdateModule;
  const cloudSync: typeof CloudSyncModule;
  const RitaWapp: typeof RitaWappPlugin;

  interface Window {
    fs: typeof FsModule;
    os: typeof OsModule;
    path: typeof PathModule;
    process: typeof ProcessModule;
    shell: typeof ShellModule;
    appWindow: typeof AppWindowModule;
    webUI: typeof WebUIModule;
    network: typeof NetworkModule;
    mongoose: typeof MongooseModule;
    db: typeof DbModule;
    update: typeof UpdateModule;
    cloudSync: typeof CloudSyncModule;
    RitaWapp: typeof RitaWappPlugin;
    rita_module_call?: (payload: string) => Promise<string>;
    rita_bridge_call?: (payload: string) => Promise<string>;
    __RITAWAPP_FRAMELESS__?: boolean;
  }
}

export {};
