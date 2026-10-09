/**
 * ============================================================================
 * RDevCore/modules/integrated/ws/ws.ts
 * ============================================================================
 * Full Node.js 'ws' WebSocket Module Mimic powered by Cesanta Mongoose
 * ============================================================================
 */

declare const globalThis: any;

const _NativeWebSocket = typeof globalThis !== "undefined" &&
    typeof (globalThis as any).WebSocket !== "undefined"
  ? (globalThis as any).WebSocket
  : null;

async function rpc(
  module: string,
  action: string,
  ...args: any[]
): Promise<any> {
  const g = globalThis as any;
  if (typeof g.rita_module_call === "function") {
    const raw = await g.rita_module_call(module, action, ...args);
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return raw;
    }
  }
  return { success: true };
}

type EventListener = (...args: any[]) => void;

class EventEmitter {
  private _events: Record<string, EventListener[]> = {};

  on(event: string, listener: EventListener): this {
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push(listener);
    return this;
  }

  once(event: string, listener: EventListener): this {
    const wrapper = (...args: any[]) => {
      this.off(event, wrapper);
      listener(...args);
    };
    return this.on(event, wrapper);
  }

  off(event: string, listener: EventListener): this {
    if (!this._events[event]) return this;
    this._events[event] = this._events[event].filter((l) => l !== listener);
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    if (!this._events[event] || this._events[event].length === 0) return false;
    [...this._events[event]].forEach((fn) => {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[ws event ${event} error]:`, err);
      }
    });
    return true;
  }
}

export class WebSocketClientConnection extends EventEmitter {
  public connId: number;
  public readyState: number = 1; // 1 = OPEN

  constructor(connId: number) {
    super();
    this.connId = connId;
  }

  async send(data: string | Uint8Array): Promise<boolean> {
    const text = typeof data === "string"
      ? data
      : new TextDecoder().decode(data);
    const res = await rpc("ws", "send", this.connId.toString(), text, "false");
    return res && res.success;
  }

  async close(): Promise<void> {
    this.readyState = 3; // CLOSED
    await rpc("ws", "close", this.connId.toString());
    this.emit("close");
  }
}

export interface ServerOptions {
  port: number;
  host?: string;
}

export class WebSocketServer extends EventEmitter {
  public port: number;
  public host: string;
  public serverId: number = 0;
  public clients: Set<WebSocketClientConnection> = new Set();
  private _pollTimer: any = null;
  private _clientsMap: Map<number, WebSocketClientConnection> = new Map();

  constructor(options: ServerOptions, callback?: () => void) {
    super();
    this.port = options.port;
    this.host = options.host || "0.0.0.0";
    this._start(callback);
  }

  private async _start(callback?: () => void) {
    const res = await rpc(
      "ws",
      "createServer",
      this.port.toString(),
      this.host,
    );
    if (res && res.success) {
      this.serverId = res.serverId;
      this._pollTimer = setInterval(() => this._poll(), 25);
      this.emit("listening");
      if (callback) callback();
    } else {
      this.emit(
        "error",
        new Error(res?.error || "Failed to start WebSocket server"),
      );
    }
  }

  private async _poll() {
    if (!this.serverId) return;
    const res = await rpc("ws", "poll", this.serverId.toString());
    if (res && res.success && Array.isArray(res.events)) {
      for (const ev of res.events) {
        if (ev.type === "connection") {
          const client = new WebSocketClientConnection(ev.connId);
          this.clients.add(client);
          this._clientsMap.set(ev.connId, client);
          this.emit("connection", client, {
            url: `ws://${this.host}:${this.port}`,
          });
        } else if (ev.type === "message") {
          const client = this._clientsMap.get(ev.connId);
          if (client) {
            client.emit("message", ev.data);
          }
        } else if (ev.type === "close") {
          const client = this._clientsMap.get(ev.connId);
          if (client) {
            client.readyState = 3;
            client.emit("close");
            this.clients.delete(client);
            this._clientsMap.delete(ev.connId);
          }
        }
      }
    }
  }

  async close(callback?: () => void): Promise<void> {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (this.serverId) {
      await rpc("ws", "closeServer", this.serverId.toString());
      this.serverId = 0;
    }
    this.emit("close");
    if (callback) callback();
  }
}

/**
 * Standard Node.js 'ws' class
 */
export class WebSocket extends EventEmitter {
  static Server = WebSocketServer;
  private _nativeWs: any = null;

  constructor(url: string) {
    super();
    // Connect as client using browser native WebSocket (WebView2 supports standard WebSocket)
    if (_NativeWebSocket) {
      this._nativeWs = new _NativeWebSocket(url);
      this._nativeWs.onopen = () => this.emit("open");
      this._nativeWs.onmessage = (e: any) => this.emit("message", e.data);
      this._nativeWs.onclose = () => this.emit("close");
      this._nativeWs.onerror = (e: any) => this.emit("error", e);
    }
  }

  send(data: string): void {
    if (this._nativeWs) this._nativeWs.send(data);
  }

  close(): void {
    if (this._nativeWs) this._nativeWs.close();
  }
}

export const ws = WebSocket;
export default WebSocket;
