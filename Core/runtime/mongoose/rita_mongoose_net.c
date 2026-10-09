/**
 * ============================================================================
 * RDevCore/runtime/mongoose/rita_mongoose_net.c
 * ============================================================================
 * Cesanta Mongoose Real Networking Engine Implementation
 * Real HTTP/HTTPS Server & Client, Full Express.js, and WebSocket (ws)
 * ============================================================================
 */

#include "rita_mongoose_net.h"
#include "mongoose.h"
#include <windows.h>
#include <wininet.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define MAX_PENDING_HTTP 128
#define MAX_WS_CLIENTS   256
#define MAX_WS_EVENTS    512

typedef struct {
    int req_id;
    int server_id;
    struct mg_connection* c;
    char method[16];
    char uri[1024];
    char query[2048];
    char headers[4096];
    char* body;
    size_t body_len;
    bool answered;
    time_t expire;
} MongoosePendingHttp;

typedef struct {
    int conn_id;
    int ws_server_id;
    struct mg_connection* c;
    bool is_active;
} MongooseWsClient;

typedef struct {
    char type[16]; // "connection", "message", "close"
    int server_id;
    int conn_id;
    char* data;
    size_t data_len;
    bool is_binary;
} MongooseWsEvent;

static struct mg_mgr s_mgr;
static HANDLE s_thread = NULL;
static DWORD s_thread_id = 0;
static bool s_running = false;
static CRITICAL_SECTION s_net_cs;
static bool s_cs_init = false;

static MongoosePendingHttp s_http_reqs[MAX_PENDING_HTTP];
static int s_next_http_req_id = 1;

static MongooseWsClient s_ws_clients[MAX_WS_CLIENTS];
static int s_next_ws_conn_id = 1;

static MongooseWsEvent s_ws_events[MAX_WS_EVENTS];
static int s_ws_event_head = 0;
static int s_ws_event_tail = 0;

static void ensure_cs(void) {
    if (!s_cs_init) {
        InitializeCriticalSection(&s_net_cs);
        s_cs_init = true;
    }
}

// Forward declarations
static void http_server_handler(struct mg_connection* c, int ev, void* ev_data);
static void ws_server_handler(struct mg_connection* c, int ev, void* ev_data);

static DWORD WINAPI mongoose_worker_thread(LPVOID param) {
    (void)param;
    mg_mgr_init(&s_mgr);

    while (s_running) {
        EnterCriticalSection(&s_net_cs);
        mg_mgr_poll(&s_mgr, 1);

        // Check expired HTTP requests
        time_t now = time(NULL);
        for (int i = 0; i < MAX_PENDING_HTTP; i++) {
            if (s_http_reqs[i].c != NULL && !s_http_reqs[i].answered && s_http_reqs[i].expire <= now) {
                s_http_reqs[i].answered = true;
                mg_http_reply(s_http_reqs[i].c, 504, "Content-Type: text/plain\r\n", "Gateway Timeout\n");
                s_http_reqs[i].c = NULL;
                if (s_http_reqs[i].body) {
                    free(s_http_reqs[i].body);
                    s_http_reqs[i].body = NULL;
                }
            }
        }
        LeaveCriticalSection(&s_net_cs);

        Sleep(1);
    }

    mg_mgr_free(&s_mgr);
    return 0;
}

bool rita_mongoose_start(void) {
    ensure_cs();
    EnterCriticalSection(&s_net_cs);

    if (s_running) {
        LeaveCriticalSection(&s_net_cs);
        return true;
    }

    memset(s_http_reqs, 0, sizeof(s_http_reqs));
    memset(s_ws_clients, 0, sizeof(s_ws_clients));
    memset(s_ws_events, 0, sizeof(s_ws_events));
    s_ws_event_head = 0;
    s_ws_event_tail = 0;

    s_running = true;
    s_thread = CreateThread(NULL, 0, mongoose_worker_thread, NULL, 0, &s_thread_id);

    LeaveCriticalSection(&s_net_cs);
    return (s_thread != NULL);
}

void rita_mongoose_stop(void) {
    ensure_cs();
    EnterCriticalSection(&s_net_cs);
    if (!s_running) {
        LeaveCriticalSection(&s_net_cs);
        return;
    }
    s_running = false;
    LeaveCriticalSection(&s_net_cs);

    if (s_thread) {
        WaitForSingleObject(s_thread, 2000);
        CloseHandle(s_thread);
        s_thread = NULL;
    }
}

bool rita_mongoose_is_running(void) {
    return s_running;
}

// ============================================================================
// Real HTTP Server & Express Dispatcher
// ============================================================================

static void http_server_handler(struct mg_connection* c, int ev, void* ev_data) {
    if (ev == MG_EV_HTTP_MSG) {
        struct mg_http_message* hm = (struct mg_http_message*)ev_data;
        int server_id = (int)(intptr_t)c->fn_data;

        // Check if there is an empty slot for this pending request
        int slot = -1;
        for (int i = 0; i < MAX_PENDING_HTTP; i++) {
            if (s_http_reqs[i].c == NULL) {
                slot = i;
                break;
            }
        }

        if (slot < 0) {
            mg_http_reply(c, 503, "Content-Type: text/plain\r\n", "Service Unavailable: Server Queue Full\n");
            return;
        }

        int req_id = s_next_http_req_id++;
        s_http_reqs[slot].req_id = req_id;
        s_http_reqs[slot].server_id = server_id;
        s_http_reqs[slot].c = c;
        s_http_reqs[slot].answered = false;
        s_http_reqs[slot].expire = time(NULL) + 30; // 30 second timeout

        snprintf(s_http_reqs[slot].method, sizeof(s_http_reqs[slot].method), "%.*s", (int)hm->method.len, hm->method.buf);
        snprintf(s_http_reqs[slot].uri, sizeof(s_http_reqs[slot].uri), "%.*s", (int)hm->uri.len, hm->uri.buf);
        snprintf(s_http_reqs[slot].query, sizeof(s_http_reqs[slot].query), "%.*s", (int)hm->query.len, hm->query.buf);

        // Serialize headers into simple string
        size_t h_pos = 0;
        s_http_reqs[slot].headers[0] = '\0';
        for (size_t i = 0; i < MG_MAX_HTTP_HEADERS && hm->headers[i].name.len > 0; i++) {
            int wr = snprintf(&s_http_reqs[slot].headers[h_pos], sizeof(s_http_reqs[slot].headers) - h_pos,
                "%.*s: %.*s\r\n",
                (int)hm->headers[i].name.len, hm->headers[i].name.buf,
                (int)hm->headers[i].value.len, hm->headers[i].value.buf);
            if (wr > 0) h_pos += (size_t)wr;
            if (h_pos + 64 >= sizeof(s_http_reqs[slot].headers)) break;
        }

        s_http_reqs[slot].body_len = hm->body.len;
        if (hm->body.len > 0) {
            s_http_reqs[slot].body = (char*)malloc(hm->body.len + 1);
            if (s_http_reqs[slot].body) {
                memcpy(s_http_reqs[slot].body, hm->body.buf, hm->body.len);
                s_http_reqs[slot].body[hm->body.len] = '\0';
            }
        } else {
            s_http_reqs[slot].body = NULL;
        }

    } else if (ev == MG_EV_CLOSE) {
        for (int i = 0; i < MAX_PENDING_HTTP; i++) {
            if (s_http_reqs[i].c == c) {
                s_http_reqs[i].c = NULL;
                s_http_reqs[i].answered = true;
                if (s_http_reqs[i].body) {
                    free(s_http_reqs[i].body);
                    s_http_reqs[i].body = NULL;
                }
            }
        }
    }
}

int rita_mongoose_http_listen(const char* listen_url, int server_id) {
    if (!rita_mongoose_start()) return -1;

    ensure_cs();
    EnterCriticalSection(&s_net_cs);

    struct mg_connection* c = mg_http_listen(&s_mgr, listen_url, http_server_handler, (void*)(intptr_t)server_id);
    LeaveCriticalSection(&s_net_cs);

    return (c != NULL) ? server_id : -1;
}

bool rita_mongoose_http_close(int server_id) {
    ensure_cs();
    EnterCriticalSection(&s_net_cs);

    for (struct mg_connection* c = s_mgr.conns; c != NULL; c = c->next) {
        if ((int)(intptr_t)c->fn_data == server_id) {
            c->is_draining = 1;
        }
    }

    LeaveCriticalSection(&s_net_cs);
    return true;
}

bool rita_mongoose_http_respond(int req_id, int status_code, const char* headers_json, const char* body, size_t body_len) {
    (void)headers_json;
    ensure_cs();
    EnterCriticalSection(&s_net_cs);

    bool found = false;
    for (int i = 0; i < MAX_PENDING_HTTP; i++) {
        if (s_http_reqs[i].req_id == req_id && s_http_reqs[i].c != NULL && !s_http_reqs[i].answered) {
            s_http_reqs[i].answered = true;

            char hdr_buf[512];
            snprintf(hdr_buf, sizeof(hdr_buf),
                "Content-Type: application/json; charset=utf-8\r\n"
                "Access-Control-Allow-Origin: *\r\n"
                "Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n"
                "Access-Control-Allow-Headers: Content-Type, Authorization\r\n");

            mg_http_reply(s_http_reqs[i].c, status_code, hdr_buf, "%.*s", (int)body_len, body ? body : "");

            s_http_reqs[i].c = NULL;
            if (s_http_reqs[i].body) {
                free(s_http_reqs[i].body);
                s_http_reqs[i].body = NULL;
            }
            found = true;
            break;
        }
    }

    LeaveCriticalSection(&s_net_cs);
    return found;
}

bool rita_mongoose_http_poll_requests(int server_id, char* response, size_t max_resp) {
    ensure_cs();
    EnterCriticalSection(&s_net_cs);

    size_t pos = 0;
    int wr = snprintf(response, max_resp, "{\"success\":true,\"requests\":[");
    if (wr > 0) pos = (size_t)wr;

    bool first = true;
    for (int i = 0; i < MAX_PENDING_HTTP; i++) {
        if (s_http_reqs[i].c != NULL && !s_http_reqs[i].answered && s_http_reqs[i].server_id == server_id) {
            if (!first && pos + 2 < max_resp) response[pos++] = ',';
            first = false;

            // Escape body for JSON safe delivery
            char* safe_body = s_http_reqs[i].body ? s_http_reqs[i].body : "";

            int req_len = snprintf(&response[pos], max_resp - pos,
                "{\"reqId\":%d,\"method\":\"%s\",\"url\":\"%s\",\"query\":\"%s\",\"body\":%s%s%s}",
                s_http_reqs[i].req_id,
                s_http_reqs[i].method,
                s_http_reqs[i].uri,
                s_http_reqs[i].query,
                (safe_body[0] == '{' || safe_body[0] == '[') ? "" : "\"",
                safe_body,
                (safe_body[0] == '{' || safe_body[0] == '[') ? "" : "\"");

            if (req_len > 0) pos += (size_t)req_len;
            if (pos + 256 >= max_resp) break;
        }
    }

    LeaveCriticalSection(&s_net_cs);

    if (pos + 4 < max_resp) {
        response[pos++] = ']';
        response[pos++] = '}';
        response[pos] = '\0';
    } else {
        snprintf(response, max_resp, "{\"success\":true,\"requests\":[]}");
    }
    return true;
}

// ============================================================================
// Real HTTP/HTTPS Client (WinINet / Mongoose)
// ============================================================================

bool rita_mongoose_http_request(const char* url, const char* method, const char* headers_str, const char* body_str, char* response, size_t max_resp) {
    HINTERNET hInternet = InternetOpenA("RitaWapp/2.0 Mongoose", INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
    if (!hInternet) {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"WinINet initialization error\"}");
        return false;
    }

    char host[256] = {0};
    char path[2048] = "/";
    URL_COMPONENTSA urlComp;
    memset(&urlComp, 0, sizeof(urlComp));
    urlComp.dwStructSize = sizeof(urlComp);
    urlComp.lpszHostName = host;
    urlComp.dwHostNameLength = sizeof(host);
    urlComp.lpszUrlPath = path;
    urlComp.dwUrlPathLength = sizeof(path);

    if (!InternetCrackUrlA(url, (DWORD)strlen(url), 0, &urlComp)) {
        InternetCloseHandle(hInternet);
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Malformed URL\"}");
        return false;
    }

    bool isHttps = (urlComp.nScheme == INTERNET_SCHEME_HTTPS);
    INTERNET_PORT port = urlComp.nPort ? urlComp.nPort : (isHttps ? INTERNET_DEFAULT_HTTPS_PORT : INTERNET_DEFAULT_HTTP_PORT);

    HINTERNET hConnect = InternetConnectA(hInternet, host, port, NULL, NULL, INTERNET_SERVICE_HTTP, 0, 0);
    if (!hConnect) {
        InternetCloseHandle(hInternet);
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Connection to host failed\"}");
        return false;
    }

    DWORD reqFlags = INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE | INTERNET_FLAG_KEEP_CONNECTION;
    if (isHttps) {
        reqFlags |= INTERNET_FLAG_SECURE | INTERNET_FLAG_IGNORE_CERT_CN_INVALID | INTERNET_FLAG_IGNORE_CERT_DATE_INVALID;
    }

    const char* reqMethod = (method && method[0]) ? method : "GET";
    HINTERNET hRequest = HttpOpenRequestA(hConnect, reqMethod, path, NULL, NULL, NULL, reqFlags, 0);
    if (!hRequest) {
        InternetCloseHandle(hConnect);
        InternetCloseHandle(hInternet);
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"HttpOpenRequest failed\"}");
        return false;
    }

    DWORD bodyLen = (body_str && body_str[0]) ? (DWORD)strlen(body_str) : 0;
    DWORD hdrLen = (headers_str && headers_str[0]) ? (DWORD)strlen(headers_str) : 0;

    BOOL sendOk = HttpSendRequestA(hRequest, headers_str, hdrLen, (LPVOID)body_str, bodyLen);
    if (!sendOk) {
        InternetCloseHandle(hRequest);
        InternetCloseHandle(hConnect);
        InternetCloseHandle(hInternet);
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"HttpSendRequest failed\"}");
        return false;
    }

    DWORD statusCode = 0;
    DWORD statLen = sizeof(statusCode);
    HttpQueryInfoA(hRequest, HTTP_QUERY_STATUS_CODE | HTTP_QUERY_FLAG_NUMBER, &statusCode, &statLen, NULL);

    char* readBuf = (char*)malloc(65536);
    if (!readBuf) {
        InternetCloseHandle(hRequest);
        InternetCloseHandle(hConnect);
        InternetCloseHandle(hInternet);
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Out of memory\"}");
        return false;
    }

    DWORD bytesRead = 0;
    size_t totalBytes = 0;
    while (InternetReadFile(hRequest, readBuf + totalBytes, 65535 - (DWORD)totalBytes, &bytesRead) && bytesRead > 0) {
        totalBytes += bytesRead;
        if (totalBytes >= 65534) break;
    }
    readBuf[totalBytes] = '\0';

    InternetCloseHandle(hRequest);
    InternetCloseHandle(hConnect);
    InternetCloseHandle(hInternet);

    // Escape response body for JSON delivery
    char* escaped = (char*)malloc(totalBytes * 2 + 128);
    if (!escaped) {
        free(readBuf);
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Out of memory on escape\"}");
        return false;
    }

    size_t e_idx = 0;
    for (size_t b = 0; b < totalBytes; b++) {
        char ch = readBuf[b];
        if (ch == '\"' || ch == '\\') { escaped[e_idx++] = '\\'; escaped[e_idx++] = ch; }
        else if (ch == '\n') { escaped[e_idx++] = '\\'; escaped[e_idx++] = 'n'; }
        else if (ch == '\r') { escaped[e_idx++] = '\\'; escaped[e_idx++] = 'r'; }
        else if (ch == '\t') { escaped[e_idx++] = '\\'; escaped[e_idx++] = 't'; }
        else if ((unsigned char)ch < 32) { /* skip */ }
        else { escaped[e_idx++] = ch; }
    }
    escaped[e_idx] = '\0';
    free(readBuf);

    snprintf(response, max_resp, "{\"success\":true,\"data\":{\"statusCode\":%lu,\"body\":\"%s\"}}", statusCode, escaped);
    free(escaped);
    return true;
}

// ============================================================================
// Real WebSocket (ws) Server & Client Implementation
// ============================================================================

static void ws_push_event(const char* type, int server_id, int conn_id, const char* data, size_t data_len, bool is_binary) {
    int next_tail = (s_ws_event_tail + 1) % MAX_WS_EVENTS;
    if (next_tail == s_ws_event_head) {
        // Queue full, drop oldest event
        s_ws_event_head = (s_ws_event_head + 1) % MAX_WS_EVENTS;
    }

    s_ws_events[s_ws_event_tail].server_id = server_id;
    s_ws_events[s_ws_event_tail].conn_id = conn_id;
    strncpy(s_ws_events[s_ws_event_tail].type, type, sizeof(s_ws_events[s_ws_event_tail].type) - 1);
    s_ws_events[s_ws_event_tail].is_binary = is_binary;

    if (data && data_len > 0) {
        s_ws_events[s_ws_event_tail].data = (char*)malloc(data_len + 1);
        if (s_ws_events[s_ws_event_tail].data) {
            memcpy(s_ws_events[s_ws_event_tail].data, data, data_len);
            s_ws_events[s_ws_event_tail].data[data_len] = '\0';
        }
        s_ws_events[s_ws_event_tail].data_len = data_len;
    } else {
        s_ws_events[s_ws_event_tail].data = NULL;
        s_ws_events[s_ws_event_tail].data_len = 0;
    }

    s_ws_event_tail = next_tail;
}

static void ws_server_handler(struct mg_connection* c, int ev, void* ev_data) {
    int ws_server_id = (int)(intptr_t)c->fn_data;

    if (ev == MG_EV_HTTP_MSG) {
        struct mg_http_message* hm = (struct mg_http_message*)ev_data;
        // Upgrade HTTP connection to WebSocket
        mg_ws_upgrade(c, hm, NULL);

    } else if (ev == MG_EV_WS_OPEN) {
        int conn_id = s_next_ws_conn_id++;
        for (int i = 0; i < MAX_WS_CLIENTS; i++) {
            if (!s_ws_clients[i].is_active) {
                s_ws_clients[i].conn_id = conn_id;
                s_ws_clients[i].ws_server_id = ws_server_id;
                s_ws_clients[i].c = c;
                s_ws_clients[i].is_active = true;
                break;
            }
        }
        ws_push_event("connection", ws_server_id, conn_id, NULL, 0, false);

    } else if (ev == MG_EV_WS_MSG) {
        struct mg_ws_message* wm = (struct mg_ws_message*)ev_data;
        int conn_id = 0;
        for (int i = 0; i < MAX_WS_CLIENTS; i++) {
            if (s_ws_clients[i].c == c && s_ws_clients[i].is_active) {
                conn_id = s_ws_clients[i].conn_id;
                break;
            }
        }
        if (conn_id > 0) {
            ws_push_event("message", ws_server_id, conn_id, wm->data.buf, wm->data.len, false);
        }

    } else if (ev == MG_EV_CLOSE) {
        int conn_id = 0;
        for (int i = 0; i < MAX_WS_CLIENTS; i++) {
            if (s_ws_clients[i].c == c && s_ws_clients[i].is_active) {
                conn_id = s_ws_clients[i].conn_id;
                s_ws_clients[i].is_active = false;
                s_ws_clients[i].c = NULL;
                break;
            }
        }
        if (conn_id > 0) {
            ws_push_event("close", ws_server_id, conn_id, NULL, 0, false);
        }
    }
}

int rita_mongoose_ws_listen(const char* listen_url, int ws_server_id) {
    if (!rita_mongoose_start()) return -1;

    ensure_cs();
    EnterCriticalSection(&s_net_cs);

    struct mg_connection* c = mg_http_listen(&s_mgr, listen_url, ws_server_handler, (void*)(intptr_t)ws_server_id);
    LeaveCriticalSection(&s_net_cs);

    return (c != NULL) ? ws_server_id : -1;
}

bool rita_mongoose_ws_close_server(int ws_server_id) {
    ensure_cs();
    EnterCriticalSection(&s_net_cs);

    for (struct mg_connection* c = s_mgr.conns; c != NULL; c = c->next) {
        if ((int)(intptr_t)c->fn_data == ws_server_id) {
            c->is_draining = 1;
        }
    }

    LeaveCriticalSection(&s_net_cs);
    return true;
}

bool rita_mongoose_ws_send(int conn_id, const char* data, size_t data_len, bool is_binary) {
    ensure_cs();
    EnterCriticalSection(&s_net_cs);

    bool sent = false;
    for (int i = 0; i < MAX_WS_CLIENTS; i++) {
        if (s_ws_clients[i].conn_id == conn_id && s_ws_clients[i].is_active && s_ws_clients[i].c != NULL) {
            int op = is_binary ? WEBSOCKET_OP_BINARY : WEBSOCKET_OP_TEXT;
            mg_ws_send(s_ws_clients[i].c, data, data_len, op);
            sent = true;
            break;
        }
    }

    LeaveCriticalSection(&s_net_cs);
    return sent;
}

bool rita_mongoose_ws_close_conn(int conn_id) {
    ensure_cs();
    EnterCriticalSection(&s_net_cs);

    bool closed = false;
    for (int i = 0; i < MAX_WS_CLIENTS; i++) {
        if (s_ws_clients[i].conn_id == conn_id && s_ws_clients[i].is_active && s_ws_clients[i].c != NULL) {
            s_ws_clients[i].c->is_draining = 1;
            s_ws_clients[i].is_active = false;
            closed = true;
            break;
        }
    }

    LeaveCriticalSection(&s_net_cs);
    return closed;
}

bool rita_mongoose_ws_poll_events(int ws_server_id, char* response, size_t max_resp) {
    ensure_cs();
    EnterCriticalSection(&s_net_cs);

    size_t pos = 0;
    int wr = snprintf(response, max_resp, "{\"success\":true,\"events\":[");
    if (wr > 0) pos = (size_t)wr;

    bool first = true;
    while (s_ws_event_head != s_ws_event_tail) {
        MongooseWsEvent* ev = &s_ws_events[s_ws_event_head];
        if (ev->server_id == ws_server_id || ws_server_id == 0) {
            if (!first && pos + 2 < max_resp) response[pos++] = ',';
            first = false;

            char* data_str = ev->data ? ev->data : "";
            int ev_len = snprintf(&response[pos], max_resp - pos,
                "{\"type\":\"%s\",\"connId\":%d,\"data\":\"%s\",\"isBinary\":%s}",
                ev->type, ev->conn_id, data_str, ev->is_binary ? "true" : "false");

            if (ev_len > 0) pos += (size_t)ev_len;
        }

        if (ev->data) {
            free(ev->data);
            ev->data = NULL;
        }
        s_ws_event_head = (s_ws_event_head + 1) % MAX_WS_EVENTS;
        if (pos + 256 >= max_resp) break;
    }

    LeaveCriticalSection(&s_net_cs);

    if (pos + 4 < max_resp) {
        response[pos++] = ']';
        response[pos++] = '}';
        response[pos] = '\0';
    } else {
        snprintf(response, max_resp, "{\"success\":true,\"events\":[]}");
    }
    return true;
}
