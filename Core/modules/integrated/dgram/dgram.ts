/**
 * ============================================================================
 * RDevCore/modules/integrated/dgram/dgram.ts
 * ============================================================================
 * Node.js-compatible 'dgram' Module (UDP Sockets) for RitaWapp
 * ============================================================================
 */

import { rpc } from "../../../client/vue/rpc.ts";

type EventCallback = (...args: any[]) => void;

class EventEmitter {
  private _events = new Map<string, EventCallback[]>();

  on(event: string, fn: EventCallback): this {
    if (!this._events.has(event)) this._events.set(event, []);
    this._events.get(event)!.push(fn);
    return this;
  }

  once(event: string, fn: EventCallback): this {
    const wrapped: EventCallback = (...args: any[]) => {
      this.off(event, wrapped);
      fn(...args);
    };
    return this.on(event, wrapped);
  }

  off(event: string, fn: EventCallback): this {
    const arr = this._events.get(event);
    if (arr) {
      this._events.set(event, arr.filter((f) => f !== fn));
    }
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    const arr = this._events.get(event);
    if (!arr || arr.length === 0) return false;
    for (const fn of [...arr]) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[dgram] Error in event '${event}':`, err);
      }
    }
    return true;
  }
}

const s_dgram_sockets = new Map<number, Socket>();

if (typeof window !== "undefined") {
  (window as any).__rita_dgram_dispatch = (
    id: number,
    event: string,
    b64Msg: string,
    senderIp: string,
    senderPort: number,
    family: string,
    size: number,
  ) => {
    const sock = s_dgram_sockets.get(id);
    if (sock) {
      if (event === "message") {
        let msg = "";
        try {
          msg = atob(b64Msg);
        } catch {
          msg = b64Msg;
        }
        const rinfo = { address: senderIp, port: senderPort, family, size };
        sock.emit("message", msg, rinfo);
      } else if (event === "close") {
        sock.emit("close");
        s_dgram_sockets.delete(id);
      } else {
        sock.emit(event);
      }
    }
  };
}

export class Socket extends EventEmitter {
  _id: number = 0;
  type: string = "udp4";
  port: number = 0;
  addressStr: string = "0.0.0.0";

  constructor(type: string = "udp4") {
    super();
    this.type = type;
  }

  async bind(
    port: number = 0,
    addressOrCb?: any,
    callback?: () => void,
  ): Promise<this> {
    let addr = "0.0.0.0";
    let cb: (() => void) | undefined = callback;

    if (typeof addressOrCb === "string") {
      addr = addressOrCb;
    } else if (typeof addressOrCb === "function") {
      cb = addressOrCb;
    }

    try {
      const res = await rpc("dgram", "bind", String(port), addr);
      if (res && res.id) {
        this._id = res.id;
        this.port = res.port;
        this.addressStr = res.address;
        s_dgram_sockets.set(this._id, this);
        this.emit("listening");
        if (cb) cb();
      } else {
        throw new Error(res?.error || "Failed to bind UDP socket");
      }
    } catch (err: any) {
      this.emit("error", err);
    }
    return this;
  }

  async send(
    msg: string | Uint8Array,
    offsetOrPort: number,
    lengthOrHost?: any,
    portOrCb?: any,
    addressOrCb?: any,
    callback?: () => void,
  ): Promise<number> {
    const strMsg = typeof msg === "string"
      ? msg
      : new TextDecoder().decode(msg);
    let targetPort = 0;
    let targetHost = "127.0.0.1";
    let cb: (() => void) | undefined = callback;

    if (typeof lengthOrHost === "string" && typeof offsetOrPort === "number") {
      targetPort = offsetOrPort;
      targetHost = lengthOrHost;
      if (typeof portOrCb === "function") cb = portOrCb;
    } else if (
      typeof portOrCb === "number" && typeof addressOrCb === "string"
    ) {
      targetPort = portOrCb;
      targetHost = addressOrCb;
    }

    if (!this._id) {
      await this.bind(0);
    }

    const res = await rpc(
      "dgram",
      "send",
      String(this._id),
      strMsg,
      String(targetPort),
      targetHost,
    );
    if (cb) cb();
    return res?.bytesSent || 0;
  }

  async close(callback?: () => void): Promise<this> {
    if (this._id) {
      await rpc("dgram", "close", String(this._id));
      s_dgram_sockets.delete(this._id);
      this._id = 0;
    }
    this.emit("close");
    if (callback) callback();
    return this;
  }

  address() {
    return { address: this.addressStr, family: "IPv4", port: this.port };
  }
}

export const dgram = {
  Socket,
  createSocket(
    typeOrOpts: string | { type: string },
    callback?: (msg: string, rinfo: any) => void,
  ): Socket {
    const type = typeof typeOrOpts === "string"
      ? typeOrOpts
      : typeOrOpts?.type || "udp4";
    const s = new Socket(type);
    if (callback) s.on("message", callback);
    return s;
  },
};

export default dgram;
