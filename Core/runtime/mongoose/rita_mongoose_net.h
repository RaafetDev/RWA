/**
 * ============================================================================
 * RDevCore/rita_mongoose_net.h
 * ============================================================================
 * Cesanta Mongoose Real Networking Engine for RitaWapp
 * Powers Real HTTP/HTTPS Server & Client, Full Express.js, and WebSocket (ws)
 * ============================================================================
 */

#ifndef RITA_MONGOOSE_NET_H
#define RITA_MONGOOSE_NET_H

#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

bool rita_mongoose_start(void);
void rita_mongoose_stop(void);
bool rita_mongoose_is_running(void);

// ============================================================================
// Real HTTP Server & Express Dispatcher
// ============================================================================

int rita_mongoose_http_listen(const char* listen_url, int server_id);
bool rita_mongoose_http_close(int server_id);
bool rita_mongoose_http_respond(int req_id, int status_code, const char* headers_json, const char* body, size_t body_len);
bool rita_mongoose_http_poll_requests(int server_id, char* response, size_t max_resp);

// ============================================================================
// Real HTTP/HTTPS Client
// ============================================================================

bool rita_mongoose_http_request(const char* url, const char* method, const char* headers_str, const char* body_str, char* response, size_t max_resp);

// ============================================================================
// Real WebSocket (ws) Server & Client
// ============================================================================

int rita_mongoose_ws_listen(const char* listen_url, int ws_server_id);
bool rita_mongoose_ws_close_server(int ws_server_id);
bool rita_mongoose_ws_send(int conn_id, const char* data, size_t data_len, bool is_binary);
bool rita_mongoose_ws_close_conn(int conn_id);
bool rita_mongoose_ws_poll_events(int ws_server_id, char* response, size_t max_resp);

#ifdef __cplusplus
}
#endif

#endif // RITA_MONGOOSE_NET_H
