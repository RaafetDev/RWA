/**
 * ============================================================================
 * RDevCore/client/vue/RitaWapp.js
 * ============================================================================
 * Vanilla JavaScript client library for RitaWapp.
 * Can be included directly via <script src="RitaWapp.js"></script>
 * ============================================================================
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.RitaWapp = exports;
    Object.assign(root, exports);
  }
})(typeof self !== "undefined" ? self : this, function () {
  async function rpc(module, action, ...args) {
    const payload = JSON.stringify({
      module: module,
      action: action,
      args: args,
    });
    const fn = window.rita_module_call || window.rita_bridge_call ||
      (window.webui && window.webui.rita_module_call);
    if (!fn) {
      throw new Error("RitaWapp native bridge not connected");
    }
    const raw = await fn(payload);
    const parsed = JSON.parse(raw);
    if (parsed.success) return parsed.data !== undefined ? parsed.data : true;
    throw new Error(parsed.error || "RPC Error");
  }

  const appWindow = {
    isFrameless: function () {
      if (typeof window.__RITAWAPP_FRAMELESS__ === "boolean") {
        return window.__RITAWAPP_FRAMELESS__;
      }
      return typeof window.chrome !== "undefined" &&
        typeof window.chrome.webview !== "undefined";
    },
    minimize: function () {
      return rpc("appWindow", "minimize");
    },
    maximize: function () {
      return rpc("appWindow", "maximize");
    },
    close: function () {
      return rpc("appWindow", "close");
    },
    setSize: function (w, h) {
      return rpc("appWindow", "setSize", w, h);
    },
    setPosition: function (x, y) {
      return rpc("appWindow", "setPosition", x, y);
    },
    center: function () {
      return rpc("appWindow", "center");
    },
  };

  const fs = {
    readFile: function (p) {
      return rpc("fs", "readFile", p);
    },
    writeFile: function (p, c) {
      return rpc("fs", "writeFile", p, c);
    },
    exists: function (p) {
      return rpc("fs", "exists", p);
    },
    readdir: function (p) {
      return rpc("fs", "readdir", p);
    },
    unlink: function (p) {
      return rpc("fs", "unlink", p);
    },
  };

  const os = {
    platform: function () {
      return rpc("os", "platform");
    },
    arch: function () {
      return rpc("os", "arch");
    },
    uptime: function () {
      return rpc("os", "uptime");
    },
    totalmem: function () {
      return rpc("os", "totalmem");
    },
    freemem: function () {
      return rpc("os", "freemem");
    },
    homedir: function () {
      return rpc("os", "homedir");
    },
  };

  const shell = {
    exec: function (cmd) {
      return rpc("shell", "exec", cmd);
    },
    openExternal: function (url) {
      return rpc("shell", "openExternal", url);
    },
  };

  return {
    rpc: rpc,
    appWindow: appWindow,
    webUI: appWindow,
    fs: fs,
    os: os,
    shell: shell,
  };
});
