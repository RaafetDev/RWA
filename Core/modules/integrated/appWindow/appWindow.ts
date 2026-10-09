/**
 * ============================================================================
 * RDevCore/modules/integrated/appWindow/appWindow.ts
 * ============================================================================
 * Native Desktop Window Management module for RitaWapp
 * ============================================================================
 */

import { rpc } from "../../../client/vue/rpc.ts";

export const appWindow = {
  /**
   * Synchronously checks if the window is currently running in native frameless mode.
   * Usable directly in HTML templates: <div v-if="appWindow.isFrameless()">
   * Also works seamlessly when awaited: await appWindow.isFrameless()
   */
  isFrameless(): boolean {
    if (typeof (window as any).__RITAWAPP_FRAMELESS__ === "boolean") {
      return (window as any).__RITAWAPP_FRAMELESS__;
    }
    // In native WebView2, chrome.webview is injected by the host.
    // In external browser fallback (Chrome/Edge/Firefox), chrome.webview is undefined.
    return typeof (window as any).chrome?.webview !== "undefined";
  },

  async minimize(): Promise<void> {
    await rpc("appWindow", "minimize");
  },

  async maximize(): Promise<void> {
    await rpc("appWindow", "maximize");
  },

  async unmaximize(): Promise<void> {
    await rpc("appWindow", "restore");
  },

  async restore(): Promise<void> {
    await rpc("appWindow", "restore");
  },

  async isMaximized(): Promise<boolean> {
    const res = await rpc("appWindow", "isMaximized");
    return typeof res === "boolean" ? res : !!res?.isMaximized;
  },

  async close(): Promise<void> {
    try {
      if (typeof (window as any).close_win === "function") {
        (window as any).close_win();
      }
    } catch (_) {}
    try {
      await rpc("appWindow", "close");
    } catch (_) {}
  },

  async setIcon(iconPath: string): Promise<void> {
    await rpc("appWindow", "setIcon", iconPath);
  },

  async drag(): Promise<void> {
    await rpc("appWindow", "drag");
  },

  async dragWindow(): Promise<void> {
    await rpc("appWindow", "drag");
  },

  async hide(): Promise<void> {
    await rpc("appWindow", "hide");
  },

  async show(): Promise<void> {
    await rpc("appWindow", "show");
  },

  async setSize(width: number, height: number): Promise<void> {
    await rpc("appWindow", "setSize", width, height);
  },

  async getSize(): Promise<{ width: number; height: number }> {
    return await rpc("appWindow", "getSize");
  },

  async setPosition(x: number, y: number): Promise<void> {
    await rpc("appWindow", "setPosition", x, y);
  },

  async getPosition(): Promise<{ x: number; y: number }> {
    return await rpc("appWindow", "getPosition");
  },

  async center(): Promise<void> {
    await rpc("appWindow", "center");
  },

  async setAlwaysOnTop(flag: boolean): Promise<void> {
    await rpc("appWindow", "setAlwaysOnTop", flag);
  },

  async setFrameless(flag: boolean): Promise<void> {
    await rpc("appWindow", "setFrameless", flag);
  },

  async setTransparent(flag: boolean): Promise<void> {
    await rpc("appWindow", "setTransparent", flag);
  },

  async reload(): Promise<void> {
    await rpc("appWindow", "reload");
  },

  async navigate(url: string): Promise<void> {
    await rpc("appWindow", "navigate", url);
  },

  async getUrl(): Promise<string> {
    return await rpc("appWindow", "getUrl");
  },

  async showMessageBox(title: string, message: string): Promise<number> {
    return await rpc("appWindow", "showMessageBox", title, message);
  },

  /**
   * Opens the native WebView2 developer tools window or in-browser inspector.
   */
  async openDevTools(): Promise<void> {
    await rpc("appWindow", "openDevTools");
  },
};

// Maintain 'webUI' as an exact alias for backward compatibility
export const webUI = appWindow;
export default appWindow;
