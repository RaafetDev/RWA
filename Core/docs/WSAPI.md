# RitaWapp Realtime WebSocket API (wsApi) Specification (v1.0.1)

## 1. Overview

`wsApi` (`rwa wsApi` / `deno task wsApi`) provides a high-performance JSON-RPC
2.0 interface over WebSocket on `ws://127.0.0.1:19800/rwa`. Any language with
native WebSocket and JSON capabilities (C#, Java, VB.NET, Python, Go, Rust) can
control project management, compilation, runtime inspection, and module actions
without installing external packages.

## 2. Handshake Protocol

1. **Connection**: Client opens `ws://127.0.0.1:19800/rwa`.
2. **Authentication**: Client must send `rwa.hello`:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "rwa.hello",
     "params": {
       "token": "<256-bit token from %LOCALAPPDATA%/RitaWapp/wsapi.token>",
       "clientName": "CSharpManager",
       "clientVersion": "1.0.1"
     }
   }
   ```
3. **Response**:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "serverVersion": "1.0.1",
       "protocolVersion": "2.0",
       "capabilities": ["jobs", "modules", "database", "streaming"],
       "projectRoot": "C:\\MyProject",
       "sessionId": "..."
     }
   }
   ```

## 3. Namespaces

- `rwa.*`: Handshake, ping, methods list, schema, event subscriptions,
  cancellation.
- `project.*`: Project open, init, info, config get/set.
- `module.*`: Module listing, enable, disable, and custom scaffold.
- `job.*`: Build, dev, test, check, doctor, packed, and status.
- `app.*`: Start, stop, restart, attach, logs.
- `db.*`: Direct SQL queries, transactions, cursors, and AI search.
- `mod.<name>.<action>`: Proxies all actions across the 18 integrated modules.
