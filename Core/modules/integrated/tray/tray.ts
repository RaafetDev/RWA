/**
 * ============================================================================
 * RDevCore/modules/integrated/tray/tray.ts
 * ============================================================================
 * System Tray Module for RitaWapp Desktop Applications
 * ============================================================================
 */

import { rpc } from "../../../client/vue/rpc.ts";

export interface TrayItem {
  name?: string;
  label?: string;
  icon?: string;
  action?: string | (() => void | Promise<void>);
  type?: "normal" | "separator" | "checkbox";
  separator?: boolean;
  disabled?: boolean;
  checked?: boolean;
}

export interface TraySetOptions {
  hideToTray?: boolean;
  hideTotray?: boolean;
  reset?: boolean;
  [key: string]: any;
}

// Action callbacks registry for menu items
const s_actionCallbacks = new Map<string, () => void | Promise<void>>();

// Global dispatcher called from native C runtime
if (typeof window !== "undefined") {
  (window as any).__rita_tray_dispatch = (action: string, id: number) => {
    const cb = s_actionCallbacks.get(action) ||
      s_actionCallbacks.get(`action_${id}`);
    if (cb) {
      try {
        cb();
      } catch (err) {
        console.error("[RitaWapp Tray] Error executing menu callback:", err);
      }
    }
  };
}

export const tray = {
  /**
   * Initializes or updates the system tray icon
   */
  async init(options?: { tooltip?: string; icon?: string }): Promise<boolean> {
    return await rpc("tray", "init", options || {});
  },

  /**
   * Configures tray features such as hide-to-tray on minimize:
   * Example:
   *   tray.set("app:minimaze", { hideToTray: true });
   *   tray.set("app:minimaze", { reset: true });
   */
  async set(key: string, options: TraySetOptions): Promise<any> {
    return await rpc("tray", "set", key, options);
  },

  /**
   * Sets the context menu items for the system tray icon
   * Example:
   *   tray.items([
   *     { name: "Open RitaWapp", action: "appShow" },
   *     { name: "-" }, // separator
   *     { name: "Mute", action: () => alert("Muted!") },
   *     { type: "separator" },
   *     { name: "Quit", action: "exit" }
   *   ]);
   */
  async items(menuItems: TrayItem[]): Promise<boolean> {
    s_actionCallbacks.clear();

    const serialized = (menuItems || []).map((item, idx) => {
      const isSep = item.type === "separator" || item.separator ||
        item.name === "-" || item.label === "-";
      if (isSep) {
        return { is_separator: true };
      }

      let actName = "";
      if (typeof item.action === "function") {
        actName = `custom_action_${idx}_${Date.now()}`;
        s_actionCallbacks.set(actName, item.action);
      } else if (typeof item.action === "string") {
        actName = item.action;
      } else {
        actName = item.name || item.label || "";
      }

      return {
        name: item.name || item.label || "",
        action: actName,
        icon: item.icon || "",
        disabled: !!item.disabled,
        checked: !!item.checked,
      };
    });

    return await rpc("tray", "items", serialized);
  },

  /**
   * Hides the application window to system tray
   */
  async appHide(): Promise<boolean> {
    return await rpc("tray", "appHide");
  },

  /**
   * Restores and displays the application window from system tray
   */
  async appShow(): Promise<boolean> {
    return await rpc("tray", "appShow");
  },

  /**
   * Checks whether the application is configured to hide to tray on minimize
   */
  async isHideToTray(): Promise<boolean> {
    const res = await rpc("tray", "isHideToTray");
    return typeof res === "boolean" ? res : !!res?.hideToTray;
  },

  /**
   * Sets or updates the tooltip text for the system tray icon
   */
  async setTooltip(text: string): Promise<boolean> {
    return await rpc("tray", "setTooltip", text);
  },

  /**
   * Sets or updates the tray icon image from file path
   */
  async setIcon(iconPath: string): Promise<boolean> {
    return await rpc("tray", "setIcon", iconPath);
  },

  /**
   * Destroys and removes the system tray icon
   */
  async destroy(): Promise<boolean> {
    return await rpc("tray", "destroy");
  },
};

export default tray;
