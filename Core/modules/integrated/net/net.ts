/**
 * ============================================================================
 * RDevCore/modules/integrated/net/net.ts
 * ============================================================================
 * Node.js-compatible 'net' Module (TCP Client & Server) for RitaWapp
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
        console.error(`[net] Error in event '${event}':`, err);
      }
    }
    return true;
  }
}

// Registry of active sockets
const s_sockets = new Map<number, Socket>();
const s_servers = new Map<number, Server>();

// Global RPC dispatcher called from C runtime
if (typeof window !== "undefined") {
  (window as any).__rita_net_dispatch = (
    id: number,
    event: string,
    ...args: any[]
  ) => {
    if (event === "connection") {
      const server = s_servers.get(id);
      if (server) {
        const [clientId, remoteIp, remotePort] = args;
        const sock = new Socket();
        sock._id = clientId;
        sock.remoteAddress = remoteIp;
        sock.remotePort = remotePort;
        s_sockets.set(clientId, sock);
        server.emit("connection", sock);
      }
    } else {
      const sock = s_sockets.get(id);
      if (sock) {
        if (event === "data") {
          // Decode Base64 data from C runtime
          try {
            const b64 = args[0] || "";
            const raw = atob(b64);
            sock.emit("data", raw);
          } catch {
            sock.emit("data", args[0]);
          }
        } else if (event === "close") {
          sock.emit("close");
          s_sockets.delete(id);
        } else {
          sock.emit(event, ...args);
        }
      }
    }
  };
}

export class Socket extends EventEmitter {
  _id: number = 0;
  remoteAddress: string = "";
  remotePort: number = 0;
  localPort: number = 0;
  connecting: boolean = false;
  destroyed: boolean = false;

  async connect(
    options: { port: number; host?: string },
    callback?: () => void,
  ): Promise<this> {
    this.connecting = true;
    const host = options.host || "127.0.0.1";
    const port = options.port;
    if (callback) this.once("connect", callback);

    try {
      const res = await rpc("net", "connect", host, String(port));
      if (res && res.id) {
        this._id = res.id;
        this.remoteAddress = host;
        this.remotePort = port;
        s_sockets.set(this._id, this);
        this.connecting = false;
        this.emit("connect");
      } else {
        throw new Error(res?.error || "Failed to connect");
      }
    } catch (err: any) {
      this.connecting = false;
      this.emit("error", err);
    }
    return this;
  }

  async write(
    data: string | Uint8Array,
    encodingOrCb?: any,
    callback?: () => void,
  ): Promise<boolean> {
    if (!this._id) return false;
    let strData = "";
    if (typeof data === "string") {
      strData = data;
    } else {
      strData = new TextDecoder().decode(data);
    }

    const cb = typeof encodingOrCb === "function" ? encodingOrCb : callback;
    const res = await rpc("net", "write", String(this._id), strData);
    if (cb) cb();
    return !!res?.success;
  }

  async end(data?: string | Uint8Array, callback?: () => void): Promise<this> {
    if (data) {
      await this.write(data);
    }
    await rpc("net", "close", String(this._id));
    if (callback) callback();
    this.emit("end");
    return this;
  }

  destroy(error?: Error): this {
    if (this._id) {
      rpc("net", "close", String(this._id));
      s_sockets.delete(this._id);
      this._id = 0;
    }
    this.destroyed = true;
    if (error) this.emit("error", error);
    this.emit("close");
    return this;
  }

  address() {
    return { address: "127.0.0.1", family: "IPv4", port: this.localPort };
  }
}

export class Server extends EventEmitter {
  _id: number = 0;
  listening: boolean = false;
  port: number = 0;
  host: string = "0.0.0.0";

  constructor(connectionListener?: (socket: Socket) => void) {
    super();
    if (connectionListener) this.on("connection", connectionListener);
  }

  async listen(
    port: number,
    hostOrCb?: any,
    callback?: () => void,
  ): Promise<this> {
    this.port = port;
    let host = "0.0.0.0";
    let cb: (() => void) | undefined = callback;

    if (typeof hostOrCb === "string") {
      host = hostOrCb;
    } else if (typeof hostOrCb === "function") {
      cb = hostOrCb;
    }
    this.host = host;

    try {
      const res = await rpc("net", "listen", String(port), host);
      if (res && res.id) {
        this._id = res.id;
        this.listening = true;
        s_servers.set(this._id, this);
        this.emit("listening");
        if (cb) cb();
      } else {
        throw new Error(res?.error || "Failed to listen");
      }
    } catch (err: any) {
      this.emit("error", err);
    }
    return this;
  }

  async close(callback?: (err?: Error) => void): Promise<this> {
    if (this._id) {
      await rpc("net", "close", String(this._id));
      s_servers.delete(this._id);
      this._id = 0;
    }
    this.listening = false;
    this.emit("close");
    if (callback) callback();
    return this;
  }

  address() {
    return { address: this.host, family: "IPv4", port: this.port };
  }
}

export const net = {
  Socket,
  Server,
  createServer(connectionListener?: (socket: Socket) => void): Server {
    return new Server(connectionListener);
  },
  createConnection(
    options: { port: number; host?: string },
    connectionListener?: () => void,
  ): Socket {
    const s = new Socket();
    s.connect(options, connectionListener);
    return s;
  },
  connect(
    portOrOptions: number | { port: number; host?: string },
    hostOrCb?: any,
    callback?: () => void,
  ): Socket {
    let opts: { port: number; host?: string };
    let cb: (() => void) | undefined = callback;
    if (typeof portOrOptions === "number") {
      opts = { port: portOrOptions };
      if (typeof hostOrCb === "string") opts.host = hostOrCb;
      else if (typeof hostOrCb === "function") cb = hostOrCb;
    } else {
      opts = portOrOptions;
      if (typeof hostOrCb === "function") cb = hostOrCb;
    }
    return net.createConnection(opts, cb);
  },
  isIP(input: string): number {
    if (net.isIPv4(input)) return 4;
    if (net.isIPv6(input)) return 6;
    return 0;
  },
  isIPv4(input: string): boolean {
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(input);
  },
  isIPv6(input: string): boolean {
    return /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(input);
  },
};

export default net;
