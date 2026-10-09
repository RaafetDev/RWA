/**
 * RitaWapp Realtime WebSocket JSON-RPC 2.0 Server Protocol Definitions
 */

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, any>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: any;
  error?: {
    code: string;
    message: string;
    data?: any;
  };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: "event";
  params: {
    topic: string;
    seq: number;
    data: any;
  };
}

export const ERROR_CODES = {
  E_UNAUTHORIZED: "E_UNAUTHORIZED",
  E_FORBIDDEN: "E_FORBIDDEN",
  E_NO_PROJECT: "E_NO_PROJECT",
  E_NO_APP_ATTACHED: "E_NO_APP_ATTACHED",
  E_BUSY: "E_BUSY",
  E_RATE_LIMITED: "E_RATE_LIMITED",
  E_PAYLOAD_TOO_LARGE: "E_PAYLOAD_TOO_LARGE",
  E_DISABLED_MODULE: "E_DISABLED_MODULE",
  E_UNKNOWN_ACTION: "E_UNKNOWN_ACTION",
  E_INVALID_PARAMS: "E_INVALID_PARAMS",
  E_TIMEOUT: "E_TIMEOUT",
  E_CANCELLED: "E_CANCELLED",
  E_PERMISSION: "E_PERMISSION",
  E_INTERNAL: "E_INTERNAL",
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
