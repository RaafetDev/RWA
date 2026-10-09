/**
 * ============================================================================
 * RitaWapp TypeScript Global Type Declarations
 * ============================================================================
 * Automatically provided by RitaWapp runtime to Vue and TypeScript files.
 * Provides zero-import global access to all native modules and Mongoose ODM.
 * ============================================================================
 */

import type { RitaWapp as RitaWappPlugin } from "./RitaWapp";
import type {
  AdmZip as AdmZipClass,
  appWindow as AppWindowModule,
  cloudSync as CloudSyncModule,
  db as DbModule,
  desktopFetch as DesktopFetchModule,
  dgram as DgramModule,
  express as ExpressModule,
  fs as FsModule,
  getAssetUrl as getAssetUrlFn,
  http as HttpModule,
  https as HttpsModule,
  isAssetsMod as isAssetsModVar,
  isModuleEnabled as isModuleEnabledFn,
  Model as ModelClass,
  mongoose as MongooseModule,
  net as NetModule,
  network as NetworkModule,
  os as OsModule,
  path as PathModule,
  process as ProcessModule,
  RitaWebSocket as RitaWebSocketClass,
  Schema as SchemaClass,
  shell as ShellModule,
  tray as TrayModule,
  update as UpdateModule,
  webUI as WebUIModule,
} from "./RitaWapp";

declare global {
  // Global modules directly accessible without import
  const fs: typeof FsModule;
  const os: typeof OsModule;
  const path: typeof PathModule;
  const process: typeof ProcessModule;
  const shell: typeof ShellModule;
  const appWindow: typeof AppWindowModule;
  const webUI: typeof WebUIModule;
  const network: typeof NetworkModule;
  const mongoose: typeof MongooseModule;
  const Schema: typeof SchemaClass;
  const Model: typeof ModelClass;
  const db: typeof DbModule;
  const sqlite: typeof DbModule;
  const sqlite3: typeof DbModule;
  const update: typeof UpdateModule;
  const cloudSync: typeof CloudSyncModule;
  const tray: typeof TrayModule;
  const net: typeof NetModule;
  const dgram: typeof DgramModule;
  const http: typeof HttpModule;
  const https: typeof HttpsModule;
  const desktopFetch: typeof DesktopFetchModule;
  const fetch: typeof DesktopFetchModule;
  const express: typeof ExpressModule;
  const ws: typeof RitaWebSocketClass;
  const WebSocket: typeof RitaWebSocketClass;
  const RitaWebSocket: typeof RitaWebSocketClass;
  const AdmZip: typeof AdmZipClass;
  const admZip: typeof AdmZipClass;
  const isModuleEnabled: typeof isModuleEnabledFn;
  const isAssetsMod: typeof isAssetsModVar;
  const getAssetUrl: typeof getAssetUrlFn;
  const asset: typeof getAssetUrlFn;
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
    Schema: typeof SchemaClass;
    Model: typeof ModelClass;
    db: typeof DbModule;
    sqlite: typeof DbModule;
    sqlite3: typeof DbModule;
    update: typeof UpdateModule;
    cloudSync: typeof CloudSyncModule;
    tray: typeof TrayModule;
    net: typeof NetModule;
    dgram: typeof DgramModule;
    http: typeof HttpModule;
    https: typeof HttpsModule;
    desktopFetch: typeof DesktopFetchModule;
    fetch: typeof DesktopFetchModule;
    express: typeof ExpressModule;
    ws: typeof RitaWebSocketClass;
    WebSocket: typeof RitaWebSocketClass;
    RitaWebSocket: typeof RitaWebSocketClass;
    AdmZip: typeof AdmZipClass;
    admZip: typeof AdmZipClass;
    isModuleEnabled: typeof isModuleEnabledFn;
    isAssetsMod: typeof isAssetsModVar;
    getAssetUrl: typeof getAssetUrlFn;
    asset: typeof getAssetUrlFn;
    RitaWapp: typeof RitaWappPlugin;
    rita_module_call?: (payload: string) => Promise<string>;
    rita_bridge_call?: (payload: string) => Promise<string>;
    __RITAWAPP_FRAMELESS__: boolean;
    __RWA_ENABLED_MODULES__?: Record<string, boolean>;
  }
}

declare module "@vue/runtime-core" {
  interface ComponentCustomProperties {
    $fs: typeof FsModule;
    fs: typeof FsModule;
    $os: typeof OsModule;
    os: typeof OsModule;
    $path: typeof PathModule;
    path: typeof PathModule;
    $process: typeof ProcessModule;
    process: typeof ProcessModule;
    $shell: typeof ShellModule;
    shell: typeof ShellModule;
    $appWindow: typeof AppWindowModule;
    appWindow: typeof AppWindowModule;
    $webUI: typeof WebUIModule;
    webUI: typeof WebUIModule;
    $network: typeof NetworkModule;
    network: typeof NetworkModule;
    $mongoose: typeof MongooseModule;
    mongoose: typeof MongooseModule;
    $Schema: typeof SchemaClass;
    Schema: typeof SchemaClass;
    $Model: typeof ModelClass;
    Model: typeof ModelClass;
    $db: typeof DbModule;
    db: typeof DbModule;
    $sqlite: typeof DbModule;
    sqlite: typeof DbModule;
    $sqlite3: typeof DbModule;
    sqlite3: typeof DbModule;
    $update: typeof UpdateModule;
    update: typeof UpdateModule;
    $cloudSync: typeof CloudSyncModule;
    cloudSync: typeof CloudSyncModule;
    $tray: typeof TrayModule;
    tray: typeof TrayModule;
    $net: typeof NetModule;
    net: typeof NetModule;
    $dgram: typeof DgramModule;
    dgram: typeof DgramModule;
    $http: typeof HttpModule;
    http: typeof HttpModule;
    $https: typeof HttpsModule;
    https: typeof HttpsModule;
    $desktopFetch: typeof DesktopFetchModule;
    desktopFetch: typeof DesktopFetchModule;
    $fetch: typeof DesktopFetchModule;
    fetch: typeof DesktopFetchModule;
    $express: typeof ExpressModule;
    express: typeof ExpressModule;
    $ws: typeof RitaWebSocketClass;
    ws: typeof RitaWebSocketClass;
    $WebSocket: typeof RitaWebSocketClass;
    WebSocket: typeof RitaWebSocketClass;
    $RitaWebSocket: typeof RitaWebSocketClass;
    RitaWebSocket: typeof RitaWebSocketClass;
    $AdmZip: typeof AdmZipClass;
    AdmZip: typeof AdmZipClass;
    $admZip: typeof AdmZipClass;
    admZip: typeof AdmZipClass;
    $isModuleEnabled: typeof isModuleEnabledFn;
    isModuleEnabled: typeof isModuleEnabledFn;
    $isAssetsMod: typeof isAssetsModVar;
    isAssetsMod: typeof isAssetsModVar;
    $getAssetUrl: typeof getAssetUrlFn;
    getAssetUrl: typeof getAssetUrlFn;
    $asset: typeof getAssetUrlFn;
    asset: typeof getAssetUrlFn;
    $rita: typeof RitaWappPlugin;
    RitaWapp: typeof RitaWappPlugin;
  }
}

export {};
