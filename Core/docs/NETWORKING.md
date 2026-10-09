# RitaWapp Embedded Networking Specification (v1.0.1)

## 1. Engine

Embedded **Cesanta Mongoose** engine provides an asynchronous, non-blocking
networking loop on a dedicated worker thread.

## 2. Supported APIs

- `http` / `https`: HTTP servers and verified TLS client requests.
- `fetch`: Desktop WHATWG `fetch` without CORS restrictions.
- `express`: Express.js routing, body parsing, and middleware engine.
- `ws`: WebSocket server and client endpoints.
- `net`: Winsock2 TCP streams and servers.
- `dgram`: Winsock2 UDP datagram sockets.

## 3. Security

- TLS certificate verification enabled by default.
- Servers bind to loopback (`127.0.0.1`) by default unless explicitly configured
  otherwise.
