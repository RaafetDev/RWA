/**
 * ============================================================================
 * RDevCore/modules/integrated/http/https.ts
 * ============================================================================
 * Node.js-compatible 'https' Module for RitaWapp
 * Powered by native WinINet SSL/TLS engine (CORS-free, enterprise TLS 1.2/1.3)
 * ============================================================================
 */

import {
  ClientRequest,
  http,
  IncomingMessage,
  RequestOptions,
} from "./http.ts";

export const https = {
  request(
    url: string,
    options?: RequestOptions,
    callback?: (res: IncomingMessage) => void,
  ): ClientRequest {
    return http.request(url, options, callback);
  },

  async get(
    url: string,
    optionsOrCallback?: any,
    callback?: (res: IncomingMessage) => void,
  ): Promise<IncomingMessage> {
    return await http.get(url, optionsOrCallback, callback);
  },

  async post(
    url: string,
    body: any,
    options?: RequestOptions,
  ): Promise<IncomingMessage> {
    return await http.post(url, body, options);
  },
};

export default https;
