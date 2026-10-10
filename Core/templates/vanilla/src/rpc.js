/**
 * RitaWapp High-Performance Asynchronous RPC Bridge
 */
export async function rpc(module, action, ...args) {
  const payload = JSON.stringify({ module, action, args });
  const g = typeof globalThis !== "undefined" ? globalThis : window;
  const bridgeFn = g.rita_module_call || g.rita_bridge_call || g.webui?.rita_module_call;

  if (typeof bridgeFn !== "function") {
    return new Promise((resolve, reject) => {
      let retries = 0;
      const interval = setInterval(() => {
        retries++;
        const fn = g.rita_module_call || g.rita_bridge_call || g.webui?.rita_module_call;
        if (typeof fn === "function") {
          clearInterval(interval);
          fn(payload)
            .then((raw) => {
              try {
                const parsed = JSON.parse(raw);
                resolve(parsed.data !== undefined ? parsed.data : parsed);
              } catch {
                resolve(raw);
              }
            })
            .catch(reject);
        } else if (retries > 30) {
          clearInterval(interval);
          if (typeof location !== "undefined" && location.origin) {
            fetch("/_rwa_rpc", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: payload,
            })
              .then((res) => res.json())
              .then((data) => {
                if (data && data.success) resolve(data.data !== undefined ? data.data : data);
                else resolve(null);
              })
              .catch(() => resolve(null));
            return;
          }
          console.warn(`[RitaWapp RPC] Native bridge not detected for ${module}.${action}`);
          resolve(null);
        }
      }, 50);
    });
  }

  const rawResult = await bridgeFn(payload);
  if (typeof rawResult === "string") {
    try {
      const parsed = JSON.parse(rawResult);
      if (parsed && typeof parsed === "object" && "success" in parsed) {
        if (parsed.success) return parsed.data !== undefined ? parsed.data : parsed;
        throw new Error(parsed.error || `RPC failed in ${module}.${action}`);
      }
      return parsed;
    } catch {
      return rawResult;
    }
  }
  return rawResult;
}

export default rpc;
