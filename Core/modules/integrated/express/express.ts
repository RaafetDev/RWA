/**
 * ============================================================================
 * RDevCore/modules/integrated/express/express.ts
 * ============================================================================
 * Full Real Express.js Engine for RitaWapp Desktop Applications
 * Backed by Cesanta Mongoose High-Performance C Native HTTP Server
 * ============================================================================
 */

import { http, HttpServer } from "../http/http.ts";

export type NextFunction = (err?: any) => void;
export type Handler = (req: Request, res: Response, next: NextFunction) => any;
export type ErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => any;

export interface RouteParam {
  name: string;
  index: number;
}

export interface RouteEntry {
  method: string; // "GET", "POST", "USE", etc.
  pattern: RegExp;
  paramNames: string[];
  handlers: Handler[];
}

export class Request {
  public method: string = "GET";
  public url: string = "/";
  public path: string = "/";
  public originalUrl: string = "/";
  public query: Record<string, string> = {};
  public params: Record<string, string> = {};
  public headers: Record<string, string> = {};
  public body: any = null;
  public ip: string = "127.0.0.1";
  public protocol: string = "http";
  public secure: boolean = false;
  public app: any;

  constructor(raw: any, app: any) {
    this.app = app;
    this.method = (raw.method || "GET").toUpperCase();
    this.url = raw.url || "/";
    this.originalUrl = this.url;

    // Split path and query
    const qIndex = this.url.indexOf("?");
    if (qIndex >= 0) {
      this.path = this.url.substring(0, qIndex);
      const qStr = this.url.substring(qIndex + 1);
      const params = new URLSearchParams(qStr);
      for (const [k, v] of params.entries()) {
        this.query[k] = v;
      }
    } else {
      this.path = this.url;
    }

    if (raw.query && typeof raw.query === "object") {
      this.query = { ...this.query, ...raw.query };
    }

    // Headers
    if (raw.headers && typeof raw.headers === "object") {
      for (const [k, v] of Object.entries(raw.headers)) {
        this.headers[k.toLowerCase()] = String(v);
      }
    }

    // Body
    if (raw.body !== undefined && raw.body !== null) {
      if (typeof raw.body === "string") {
        try {
          this.body = JSON.parse(raw.body);
        } catch {
          this.body = raw.body;
        }
      } else {
        this.body = raw.body;
      }
    }
  }

  get(header: string): string | undefined {
    return this.headers[header.toLowerCase()];
  }

  header(header: string): string | undefined {
    return this.get(header);
  }
}

export class Response {
  public statusCode: number = 200;
  public headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  };
  public headersSent: boolean = false;
  private _rawRes: any;

  constructor(rawRes: any) {
    this._rawRes = rawRes;
  }

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  sendStatus(code: number): void {
    this.status(code).send(String(code));
  }

  setHeader(name: string, value: string): this {
    this.headers[name] = value;
    return this;
  }

  header(name: string, value: string): this {
    return this.setHeader(name, value);
  }

  set(field: any, val?: any): this {
    if (typeof field === "object") {
      for (const [k, v] of Object.entries(field)) {
        this.setHeader(k, String(v));
      }
    } else if (val !== undefined) {
      this.setHeader(field, String(val));
    }
    return this;
  }

  get(name: string): string | undefined {
    return this.headers[name];
  }

  type(mime: string): this {
    this.setHeader("Content-Type", mime);
    return this;
  }

  cookie(name: string, val: string, options: any = {}): this {
    let cookieStr = `${name}=${encodeURIComponent(val)}`;
    if (options.maxAge) cookieStr += `; Max-Age=${options.maxAge}`;
    if (options.domain) cookieStr += `; Domain=${options.domain}`;
    if (options.path) cookieStr += `; Path=${options.path}`;
    else cookieStr += "; Path=/";
    if (options.httpOnly) cookieStr += "; HttpOnly";
    if (options.secure) cookieStr += "; Secure";
    this.setHeader("Set-Cookie", cookieStr);
    return this;
  }

  clearCookie(name: string, options: any = {}): this {
    return this.cookie(name, "", { ...options, maxAge: 0 });
  }

  redirect(url: string): void;
  redirect(status: number, url: string): void;
  redirect(statusOrUrl: any, url?: string): void {
    let code = 302;
    let target = statusOrUrl;
    if (typeof statusOrUrl === "number") {
      code = statusOrUrl;
      target = url;
    }
    this.status(code);
    this.setHeader("Location", target);
    this.send(`Found. Redirecting to ${target}`);
  }

  async send(data: any): Promise<void> {
    if (this.headersSent) return;
    this.headersSent = true;

    let payload = "";
    if (typeof data === "object" && data !== null) {
      payload = JSON.stringify(data);
      if (!this.headers["Content-Type"]) {
        this.setHeader("Content-Type", "application/json; charset=utf-8");
      }
    } else {
      payload = String(data !== undefined ? data : "");
      if (!this.headers["Content-Type"]) {
        this.setHeader("Content-Type", "text/plain; charset=utf-8");
      }
    }

    if (this._rawRes && typeof this._rawRes.send === "function") {
      this._rawRes.statusCode = this.statusCode;
      await this._rawRes.send(payload);
    }
  }

  async json(data: any): Promise<void> {
    this.setHeader("Content-Type", "application/json; charset=utf-8");
    await this.send(data);
  }

  async end(data?: any): Promise<void> {
    await this.send(data || "");
  }
}

function pathToRegex(path: string): { regex: RegExp; paramNames: string[] } {
  if (path === "*" || path === "") {
    return { regex: /.*/, paramNames: [] };
  }

  const paramNames: string[] = [];
  const escaped = path
    .replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1")
    .replace(/\\:([a-zA-Z0-9_]+)/g, (_match, name) => {
      paramNames.push(name);
      return "([^\\/]+)";
    })
    .replace(/\\\*/g, "(.*)");

  return { regex: new RegExp(`^${escaped}(?:\\/)?$`, "i"), paramNames };
}

export class Router {
  protected routes: RouteEntry[] = [];

  use(pathOrHandler: string | Handler | Router, ...handlers: Handler[]): this {
    let path = "/";
    let fns: Handler[] = [];

    if (typeof pathOrHandler === "string") {
      path = pathOrHandler;
      fns = handlers;
    } else if (pathOrHandler instanceof Router) {
      // Mount sub-router
      const sub = pathOrHandler;
      for (const r of sub.routes) {
        this.routes.push(r);
      }
      return this;
    } else if (typeof pathOrHandler === "function") {
      path = "*";
      fns = [pathOrHandler, ...handlers];
    }

    const { regex, paramNames } = pathToRegex(path === "*" ? ".*" : path);
    this.routes.push({
      method: "USE",
      pattern: regex,
      paramNames,
      handlers: fns,
    });
    return this;
  }

  route(path: string) {
    return {
      get: (...handlers: Handler[]) => {
        this.get(path, ...handlers);
        return this.route(path);
      },
      post: (...handlers: Handler[]) => {
        this.post(path, ...handlers);
        return this.route(path);
      },
      put: (...handlers: Handler[]) => {
        this.put(path, ...handlers);
        return this.route(path);
      },
      delete: (...handlers: Handler[]) => {
        this.delete(path, ...handlers);
        return this.route(path);
      },
    };
  }

  get(path: string, ...handlers: Handler[]): this {
    return this.addRoute("GET", path, handlers);
  }
  post(path: string, ...handlers: Handler[]): this {
    return this.addRoute("POST", path, handlers);
  }
  put(path: string, ...handlers: Handler[]): this {
    return this.addRoute("PUT", path, handlers);
  }
  delete(path: string, ...handlers: Handler[]): this {
    return this.addRoute("DELETE", path, handlers);
  }
  patch(path: string, ...handlers: Handler[]): this {
    return this.addRoute("PATCH", path, handlers);
  }
  options(path: string, ...handlers: Handler[]): this {
    return this.addRoute("OPTIONS", path, handlers);
  }
  all(path: string, ...handlers: Handler[]): this {
    return this.addRoute("ALL", path, handlers);
  }

  protected addRoute(method: string, path: string, handlers: Handler[]): this {
    const { regex, paramNames } = pathToRegex(path);
    this.routes.push({
      method: method.toUpperCase(),
      pattern: regex,
      paramNames,
      handlers,
    });
    return this;
  }

  async handle(req: Request, res: Response): Promise<void> {
    let index = 0;

    const next: NextFunction = async (err?: any) => {
      if (err) {
        res.status(500).json({ error: String(err) });
        return;
      }

      if (index >= this.routes.length) {
        if (!res.headersSent) {
          res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
        }
        return;
      }

      const route = this.routes[index++];

      // Check method
      if (
        route.method !== "USE" && route.method !== "ALL" &&
        route.method !== req.method
      ) {
        return next();
      }

      // Check path
      const match = req.path.match(route.pattern);
      if (!match) {
        return next();
      }

      // Extract route params
      if (route.paramNames.length > 0) {
        for (let i = 0; i < route.paramNames.length; i++) {
          const val = match[i + 1];
          if (val) req.params[route.paramNames[i]] = decodeURIComponent(val);
        }
      }

      // Execute route handlers sequentially
      let hIndex = 0;
      const nextHandler = async () => {
        if (hIndex >= route.handlers.length) {
          return next();
        }
        const fn = route.handlers[hIndex++];
        try {
          await fn(req, res, nextHandler);
        } catch (e) {
          next(e);
        }
      };

      await nextHandler();
    };

    await next();
  }
}

export class Application extends Router {
  private _server: HttpServer | null = null;
  public locals: Record<string, any> = {};

  listen(port: number, host?: any, callback?: () => void): HttpServer {
    let actualHost = "0.0.0.0";
    let actualCb = callback;

    if (typeof host === "function") {
      actualCb = host;
    } else if (typeof host === "string") {
      actualHost = host;
    }

    this._server = http.createServer(async (rawReq, rawRes) => {
      const req = new Request(rawReq, this);
      const res = new Response(rawRes);
      await this.handle(req, res);
    });

    this._server.listen(port, actualHost, actualCb);
    return this._server;
  }

  close(callback?: () => void): void {
    if (this._server) {
      this._server.close(callback);
      this._server = null;
    }
  }
}

export function express(): Application {
  return new Application();
}

express.Router = function () {
  return new Router();
};

express.json = function () {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (typeof req.body === "string" && req.body.trim().startsWith("{")) {
      try {
        req.body = JSON.parse(req.body);
      } catch { /* noop */ }
    }
    next();
  };
};

express.urlencoded = function (_options?: any) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (typeof req.body === "string" && req.body.includes("=")) {
      const p = new URLSearchParams(req.body);
      const parsed: Record<string, string> = {};
      for (const [k, v] of p.entries()) parsed[k] = v;
      req.body = parsed;
    }
    next();
  };
};

export default express;
