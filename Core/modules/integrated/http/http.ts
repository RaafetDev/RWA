/**
 * ============================================================================
 * RDevCore/modules/integrated/http/http.ts
 * ============================================================================
 * Real Node.js-compatible 'http' Module for RitaWapp
 * Backed by Cesanta Mongoose (real multi-client HTTP server & client)
 * ============================================================================
 */

declare const globalThis: any;

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

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export class IncomingMessage {
  statusCode: number = 200;
  statusMessage: string = "OK";
  headers: Record<string, string> = {};
  body: string = "";
  private _listeners: Record<string, Array<(...args: any[]) => void>> = {};
  private _emitted: boolean = false;

  constructor(
    statusCode: number = 200,
    body: string = "",
    headers: Record<string, string> = {},
  ) {
    this.statusCode = statusCode;
    this.statusMessage = statusCode >= 200 && statusCode < 300 ? "OK" : "Error";
    this.body = body;
    this.headers = headers;

    queueMicrotask(() => {
      this._emitPayload();
    });
  }

  private _emitPayload() {
    if (this._emitted) return;
    this._emitted = true;
    this.emit("data", this.body);
    this.emit("end");
  }

  on(event: string, callback: (...args: any[]) => void): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
    if (this._emitted) {
      if (event === "data") callback(this.body);
      else if (event === "end") callback();
    }
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    if (this._listeners[event]) {
      this._listeners[event].forEach((fn) => fn(...args));
      return true;
    }
    return false;
  }

  json<T = any>(): T {
    return JSON.parse(this.body);
  }

  text(): string {
    return this.body;
  }
}

export class ClientRequest implements PromiseLike<IncomingMessage> {
  url: string;
  options: RequestOptions;
  private _listeners: Record<string, Array<(...args: any[]) => void>> = {};
  private _promise: Promise<IncomingMessage>;
  private _callback?: (res: IncomingMessage) => void;

  constructor(
    url: string,
    options: RequestOptions = {},
    callback?: (res: IncomingMessage) => void,
  ) {
    this.url = url;
    this.options = options;
    this._callback = callback;
    this._promise = this._execute();
  }

  private async _execute(): Promise<IncomingMessage> {
    try {
      const res = await rpc("http", "request", {
        url: this.url,
        method: this.options.method || "GET",
        headers: this.formatHeaders(this.options.headers),
        body: this.options.body || "",
      });
      const code = res?.data?.statusCode || res?.statusCode || 200;
      const body = res?.data?.body || res?.body || "";
      const headers = res?.data?.headers || res?.headers || {};
      const msg = new IncomingMessage(code, body, headers);
      if (this._callback) {
        try {
          this._callback(msg);
        } catch (cbErr) {
          console.error("[http callback error]:", cbErr);
        }
      }
      this.emit("response", msg);
      return msg;
    } catch (err: any) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      queueMicrotask(() => {
        this.emit("error", errorObj);
      });
      throw errorObj;
    }
  }

  on(event: string, callback: (...args: any[]) => void): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    if (this._listeners[event] && this._listeners[event].length > 0) {
      this._listeners[event].forEach((fn) => fn(...args));
      return true;
    }
    return false;
  }

  write(chunk: string): this {
    this.options.body = (this.options.body || "") + chunk;
    return this;
  }

  end(data?: string): this {
    if (data) this.write(data);
    return this;
  }

  send(): Promise<IncomingMessage> {
    return this._promise;
  }

  then<TResult1 = IncomingMessage, TResult2 = never>(
    onfulfilled?:
      | ((value: IncomingMessage) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this._promise.then(onfulfilled, onrejected);
  }

  private formatHeaders(h?: Record<string, string>): string {
    if (!h) return "";
    return Object.entries(h)
      .map(([k, v]) => `${k}: ${v}\r\n`)
      .join("");
  }
}

export class HttpServer {
  public serverId: number = 0;
  public port: number = 8080;
  public host: string = "0.0.0.0";
  private _pollTimer: any = null;
  private _handler?: (req: any, res: any) => void;

  constructor(handler?: (req: any, res: any) => void) {
    this._handler = handler;
  }

  async listen(port: number, host?: any, callback?: () => void): Promise<this> {
    this.port = port;
    if (typeof host === "function") {
      callback = host;
      this.host = "0.0.0.0";
    } else if (typeof host === "string") {
      this.host = host;
    }
    const res = await rpc(
      "http",
      "createServer",
      this.port.toString(),
      this.host,
    );
    if (res && res.success) {
      this.serverId = res.serverId;
      this._pollTimer = setInterval(() => this._poll(), 25);
      if (callback) callback();
    }
    return this;
  }

  private async _poll() {
    if (!this.serverId) return;
    const res = await rpc("http", "poll", this.serverId.toString());
    if (res && res.success && Array.isArray(res.requests)) {
      for (const req of res.requests) {
        const responseObj = {
          statusCode: 200,
          headers: {} as Record<string, string>,
          setHeader(k: string, v: string) {
            this.headers[k] = v;
            return this;
          },
          status(code: number) {
            this.statusCode = code;
            return this;
          },
          async send(body: string) {
            await rpc(
              "http",
              "respond",
              req.reqId.toString(),
              this.statusCode.toString(),
              body,
            );
          },
          async json(data: any) {
            await this.send(JSON.stringify(data));
          },
        };
        if (this._handler) {
          this._handler(req, responseObj);
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
      await rpc("http", "close", this.serverId.toString());
      this.serverId = 0;
    }
    if (callback) callback();
  }
}

export function createServer(
  handler?: (req: any, res: any) => void,
): HttpServer {
  return new HttpServer(handler);
}

export const http = {
  createServer,

  request(
    url: string,
    options?: RequestOptions,
    callback?: (res: IncomingMessage) => void,
  ): ClientRequest {
    return new ClientRequest(url, options, callback);
  },

  get(
    url: string,
    optionsOrCallback?: any,
    callback?: (res: IncomingMessage) => void,
  ): ClientRequest {
    let opts: RequestOptions = { method: "GET" };
    let cb = callback;

    if (typeof optionsOrCallback === "function") {
      cb = optionsOrCallback;
    } else if (optionsOrCallback) {
      opts = { ...optionsOrCallback, method: "GET" };
    }

    return new ClientRequest(url, opts, cb);
  },

  post(url: string, body: any, options?: RequestOptions): ClientRequest {
    const strBody = typeof body === "string" ? body : JSON.stringify(body);
    return new ClientRequest(url, {
      ...options,
      method: "POST",
      body: strBody,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    });
  },
};

export default http;
