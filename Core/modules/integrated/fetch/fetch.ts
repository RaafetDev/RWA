/**
 * ============================================================================
 * RDevCore/modules/integrated/fetch/fetch.ts
 * ============================================================================
 * WHATWG-compatible Desktop Fetch API for RitaWapp
 * Bypasses all browser CORS restrictions via native WinINet bridge
 * ============================================================================
 */

import { http } from "../http/http.ts";

const _nativeFetch =
  typeof globalThis !== "undefined" && typeof globalThis.fetch === "function"
    ? globalThis.fetch.bind(globalThis)
    : null;

export class DesktopResponse {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Headers;
  private _body: string;

  constructor(
    body: string,
    status: number = 200,
    headers: Record<string, string> = {},
  ) {
    this._body = body;
    this.status = status;
    this.statusText = status >= 200 && status < 300 ? "OK" : "Error";
    this.ok = status >= 200 && status < 300;
    this.headers = new Headers(headers);
  }

  async text(): Promise<string> {
    return this._body;
  }

  async json<T = any>(): Promise<T> {
    return JSON.parse(this._body);
  }

  async blob(): Promise<Blob> {
    return new Blob([this._body]);
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return new TextEncoder().encode(this._body).buffer;
  }
}

export async function fetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response | DesktopResponse> {
  const url = typeof input === "string"
    ? input
    : input instanceof URL
    ? input.toString()
    : input.url;

  // Relative URLs, internal assets, or non-http protocols use browser native fetch
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    if (_nativeFetch) return await _nativeFetch(input as any, init);
  }

  const method = (init?.method || "GET").toUpperCase();

  let bodyStr = "";
  if (init?.body) {
    if (typeof init.body === "string") bodyStr = init.body;
    else if (init.body instanceof URLSearchParams) {
      bodyStr = init.body.toString();
    } else if (typeof init.body === "object") {
      bodyStr = JSON.stringify(init.body);
    }
  }

  const headersObj: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((val, key) => {
        headersObj[key] = val;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) headersObj[k] = v;
    } else {
      Object.assign(headersObj, init.headers);
    }
  }

  // Use native C WinINet HTTP bridge for true CORS-free desktop network calls
  try {
    const res = await http.request(url, {
      method,
      headers: headersObj,
      body: bodyStr,
    }).send();

    return new DesktopResponse(res.body, res.statusCode, res.headers) as any;
  } catch (nativeErr) {
    // Fallback to standard web fetch if native bridge encounters issues
    if (_nativeFetch) {
      return await _nativeFetch(input as any, init);
    }
    throw nativeErr;
  }
}

export default fetch;
