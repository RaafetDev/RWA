/**
 * ============================================================================
 * RDevCore/modules/integrated/net/net_module.c
 * ============================================================================
 * Node.js-compatible 'net' Module (TCP Client & Server) Implementation
 * ============================================================================
 */

#include "net_module.h"
#include "ritawapp_modules.h"
#include "../../../runtime/webui/include/webui.h"
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

#define MAX_NET_SOCKETS 64

typedef enum {
    NET_SOCK_FREE = 0,
    NET_SOCK_SERVER,
    NET_SOCK_CLIENT
} NetSocketType;

typedef struct {
    int id;
    SOCKET s;
    NetSocketType type;
    size_t window;
    HANDLE hThread;
    bool active;
    char remote_ip[64];
    int remote_port;
    int local_port;
} NetSocketEntry;

static NetSocketEntry s_net_sockets[MAX_NET_SOCKETS];
static CRITICAL_SECTION s_net_cs;
static bool s_net_cs_init = false;
static int s_next_socket_id = 1;

static void ensure_net_cs(void) {
    if (!s_net_cs_init) {
        WSADATA wsa;
        WSAStartup(MAKEWORD(2, 2), &wsa);
        InitializeCriticalSection(&s_net_cs);
        s_net_cs_init = true;
    }
}

static void get_wsa_error_desc(int code, char* buf, size_t max_buf) {
    char msg[256] = {0};
    DWORD ret = FormatMessageA(
        FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
        NULL,
        code,
        MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
        msg,
        sizeof(msg),
        NULL
    );
    size_t len = strlen(msg);
    while (len > 0 && (msg[len - 1] == '\r' || msg[len - 1] == '\n' || msg[len - 1] == ' ' || msg[len - 1] == '.')) {
        msg[--len] = '\0';
    }
    for (size_t i = 0; i < len; i++) {
        if (msg[i] == '"' || msg[i] == '\\') msg[i] = '\'';
    }
    if (ret > 0 && len > 0) {
        snprintf(buf, max_buf, "%d (%s)", code, msg);
    } else {
        snprintf(buf, max_buf, "%d", code);
    }
}

// Simple Base64 encoder for binary payloads over WebUI RPC
static const char b64_table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static void base64_encode(const unsigned char* in, size_t in_len, char* out, size_t max_out) {
    size_t out_len = 0;
    for (size_t i = 0; i < in_len; i += 3) {
        if (out_len + 4 >= max_out) break;
        uint32_t octet_a = i < in_len ? in[i] : 0;
        uint32_t octet_b = (i + 1) < in_len ? in[i + 1] : 0;
        uint32_t octet_c = (i + 2) < in_len ? in[i + 2] : 0;
        uint32_t triple = (octet_a << 16) + (octet_b << 8) + octet_c;

        out[out_len++] = b64_table[(triple >> 18) & 0x3F];
        out[out_len++] = b64_table[(triple >> 12) & 0x3F];
        out[out_len++] = (i + 1 < in_len) ? b64_table[(triple >> 6) & 0x3F] : '=';
        out[out_len++] = (i + 2 < in_len) ? b64_table[triple & 0x3F] : '=';
    }
    out[out_len] = '\0';
}

static DWORD WINAPI ClientRecvThread(LPVOID param) {
    NetSocketEntry* entry = (NetSocketEntry*)param;
    char buf[4096];
    char b64[6000];

    while (entry->active && entry->s != INVALID_SOCKET) {
        int n = recv(entry->s, buf, sizeof(buf), 0);
        if (n > 0) {
            base64_encode((unsigned char*)buf, (size_t)n, b64, sizeof(b64));
            char js[6500];
            snprintf(js, sizeof(js),
                "if (typeof window !== 'undefined' && window.__rita_net_dispatch) {"
                "  window.__rita_net_dispatch(%d, 'data', '%s');"
                "}",
                entry->id, b64);
            webui_run(entry->window, js);
        } else {
            // Socket closed or errored
            break;
        }
    }

    if (entry->active) {
        char js[256];
        snprintf(js, sizeof(js),
            "if (typeof window !== 'undefined' && window.__rita_net_dispatch) {"
            "  window.__rita_net_dispatch(%d, 'close');"
            "}",
            entry->id);
        webui_run(entry->window, js);
    }

    entry->active = false;
    if (entry->s != INVALID_SOCKET) {
        closesocket(entry->s);
        entry->s = INVALID_SOCKET;
    }
    return 0;
}

static DWORD WINAPI ServerAcceptThread(LPVOID param) {
    NetSocketEntry* server_entry = (NetSocketEntry*)param;

    while (server_entry->active && server_entry->s != INVALID_SOCKET) {
        struct sockaddr_in client_addr;
        int addr_len = sizeof(client_addr);
        SOCKET client_sock = accept(server_entry->s, (struct sockaddr*)&client_addr, &addr_len);
        if (client_sock == INVALID_SOCKET) {
            break;
        }

        EnterCriticalSection(&s_net_cs);
        NetSocketEntry* client_entry = NULL;
        for (int i = 0; i < MAX_NET_SOCKETS; i++) {
            if (s_net_sockets[i].type == NET_SOCK_FREE) {
                client_entry = &s_net_sockets[i];
                client_entry->id = s_next_socket_id++;
                client_entry->s = client_sock;
                client_entry->type = NET_SOCK_CLIENT;
                client_entry->window = server_entry->window;
                client_entry->active = true;
                client_entry->remote_port = ntohs(client_addr.sin_port);
                strncpy(client_entry->remote_ip, inet_ntoa(client_addr.sin_addr), sizeof(client_entry->remote_ip) - 1);
                client_entry->local_port = server_entry->local_port;
                break;
            }
        }
        LeaveCriticalSection(&s_net_cs);

        if (client_entry) {
            // Notify JavaScript server of new connection
            char js[512];
            snprintf(js, sizeof(js),
                "if (typeof window !== 'undefined' && window.__rita_net_dispatch) {"
                "  window.__rita_net_dispatch(%d, 'connection', %d, '%s', %d);"
                "}",
                server_entry->id, client_entry->id, client_entry->remote_ip, client_entry->remote_port);
            webui_run(server_entry->window, js);

            // Spawn receive thread for new client
            client_entry->hThread = CreateThread(NULL, 0, ClientRecvThread, client_entry, 0, NULL);
        } else {
            closesocket(client_sock);
        }
    }
    return 0;
}

void register_net_module(void) {
    ensure_net_cs();
    ritawapp_register_module("net", handle_net_action);
}

void handle_net_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp) {
    RW_UNUSED(window);
    ensure_net_cs();

    if (strcmp(action, "listen") == 0) {
        // TCP Server Listen
        char port_str[16] = {0};
        char host[64] = {0};
        json_extract_arg(json_request, 0, port_str, sizeof(port_str));
        json_extract_arg(json_request, 1, host, sizeof(host));
        int port = atoi(port_str);
        if (port <= 0) port = 3000;
        if (!host[0] || strcmp(host, "0.0.0.0") == 0) strncpy(host, "127.0.0.1", sizeof(host) - 1);

        ensure_net_cs();
        SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (s == INVALID_SOCKET) {
            int wsa_err = WSAGetLastError();
            char err_desc[256] = {0};
            get_wsa_error_desc(wsa_err, err_desc, sizeof(err_desc));
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Failed to create TCP socket: %s\",\"wsaError\":%d}", err_desc, wsa_err);
            return;
        }

        int opt = 1;
        setsockopt(s, SOL_SOCKET, SO_EXCLUSIVEADDRUSE, (const char*)&opt, sizeof(opt));

        struct sockaddr_in sa;
        memset(&sa, 0, sizeof(sa));
        sa.sin_family = AF_INET;
        sa.sin_port = htons((unsigned short)port);
        sa.sin_addr.s_addr = inet_addr(host);
        if (sa.sin_addr.s_addr == INADDR_NONE || sa.sin_addr.s_addr == htonl(INADDR_ANY)) {
            sa.sin_addr.s_addr = inet_addr("127.0.0.1");
        }

        int bind_res = bind(s, (struct sockaddr*)&sa, sizeof(sa));
        int initial_wsa_err = (bind_res != 0) ? WSAGetLastError() : 0;
        if (bind_res != 0) {
            // Port in use or busy: retry adjacent ports up to 10 following ports
            bool rebound = false;
            for (int retry_port = port + 1; retry_port <= port + 10; retry_port++) {
                sa.sin_port = htons((unsigned short)retry_port);
                if (bind(s, (struct sockaddr*)&sa, sizeof(sa)) == 0) {
                    port = retry_port;
                    rebound = true;
                    break;
                }
            }
            if (!rebound) {
                closesocket(s);
                char err_desc[256] = {0};
                get_wsa_error_desc(initial_wsa_err, err_desc, sizeof(err_desc));
                snprintf(response, max_resp, "{\"success\":false,\"error\":\"Failed to bind TCP port %d: %s\",\"wsaError\":%d}", port, err_desc, initial_wsa_err);
                return;
            }
        }

        if (listen(s, SOMAXCONN) != 0) {
            int wsa_err = WSAGetLastError();
            closesocket(s);
            char err_desc[256] = {0};
            get_wsa_error_desc(wsa_err, err_desc, sizeof(err_desc));
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Failed to listen TCP port %d: %s\",\"wsaError\":%d}", port, err_desc, wsa_err);
            return;
        }

        EnterCriticalSection(&s_net_cs);
        NetSocketEntry* entry = NULL;
        for (int i = 0; i < MAX_NET_SOCKETS; i++) {
            if (s_net_sockets[i].type == NET_SOCK_FREE) {
                entry = &s_net_sockets[i];
                entry->id = s_next_socket_id++;
                entry->s = s;
                entry->type = NET_SOCK_SERVER;
                entry->window = window;
                entry->active = true;
                entry->local_port = port;
                strncpy(entry->remote_ip, host, sizeof(entry->remote_ip) - 1);
                break;
            }
        }
        LeaveCriticalSection(&s_net_cs);

        if (!entry) {
            closesocket(s);
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Maximum concurrent sockets reached\"}");
            return;
        }

        entry->hThread = CreateThread(NULL, 0, ServerAcceptThread, entry, 0, NULL);
        snprintf(response, max_resp, "{\"success\":true,\"data\":{\"id\":%d,\"port\":%d,\"host\":\"%s\"}}", entry->id, port, host);

    } else if (strcmp(action, "connect") == 0) {
        // TCP Client Connect
        char host[128] = {0};
        char port_str[16] = {0};
        json_extract_arg(json_request, 0, host, sizeof(host));
        json_extract_arg(json_request, 1, port_str, sizeof(port_str));
        int port = atoi(port_str);
        if (!host[0] || port <= 0) {
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Invalid host or port\"}");
            return;
        }

        SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (s == INVALID_SOCKET) {
            int wsa_err = WSAGetLastError();
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Failed to create socket (WSA: %d)\",\"wsaError\":%d}", wsa_err, wsa_err);
            return;
        }

        struct hostent* he = gethostbyname(host);
        if (!he) {
            closesocket(s);
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Host lookup failed for %s\"}", host);
            return;
        }

        struct sockaddr_in sa;
        memset(&sa, 0, sizeof(sa));
        sa.sin_family = AF_INET;
        sa.sin_port = htons((unsigned short)port);
        memcpy(&sa.sin_addr, he->h_addr_list[0], he->h_length);

        if (connect(s, (struct sockaddr*)&sa, sizeof(sa)) != 0) {
            int wsa_err = WSAGetLastError();
            closesocket(s);
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Connection refused to %s:%d (WSA: %d)\",\"wsaError\":%d}", host, port, wsa_err, wsa_err);
            return;
        }

        EnterCriticalSection(&s_net_cs);
        NetSocketEntry* entry = NULL;
        for (int i = 0; i < MAX_NET_SOCKETS; i++) {
            if (s_net_sockets[i].type == NET_SOCK_FREE) {
                entry = &s_net_sockets[i];
                entry->id = s_next_socket_id++;
                entry->s = s;
                entry->type = NET_SOCK_CLIENT;
                entry->window = window;
                entry->active = true;
                entry->remote_port = port;
                strncpy(entry->remote_ip, host, sizeof(entry->remote_ip) - 1);
                break;
            }
        }
        LeaveCriticalSection(&s_net_cs);

        if (!entry) {
            closesocket(s);
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Socket table full\"}");
            return;
        }

        entry->hThread = CreateThread(NULL, 0, ClientRecvThread, entry, 0, NULL);
        snprintf(response, max_resp, "{\"success\":true,\"data\":{\"id\":%d,\"host\":\"%s\",\"port\":%d}}", entry->id, host, port);

    } else if (strcmp(action, "write") == 0) {
        char id_str[16] = {0};
        char data[4096] = {0};
        json_extract_arg(json_request, 0, id_str, sizeof(id_str));
        json_extract_arg(json_request, 1, data, sizeof(data));
        int sock_id = atoi(id_str);

        EnterCriticalSection(&s_net_cs);
        NetSocketEntry* entry = NULL;
        for (int i = 0; i < MAX_NET_SOCKETS; i++) {
            if (s_net_sockets[i].id == sock_id && s_net_sockets[i].active) {
                entry = &s_net_sockets[i];
                break;
            }
        }

        if (!entry || entry->s == INVALID_SOCKET) {
            LeaveCriticalSection(&s_net_cs);
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Socket not connected\"}");
            return;
        }

        int sent = send(entry->s, data, (int)strlen(data), 0);
        LeaveCriticalSection(&s_net_cs);

        snprintf(response, max_resp, "{\"success\":%s,\"bytesWritten\":%d}", (sent >= 0) ? "true" : "false", sent);

    } else if (strcmp(action, "close") == 0 || strcmp(action, "end") == 0) {
        char id_str[16] = {0};
        json_extract_arg(json_request, 0, id_str, sizeof(id_str));
        int sock_id = atoi(id_str);

        EnterCriticalSection(&s_net_cs);
        for (int i = 0; i < MAX_NET_SOCKETS; i++) {
            if (s_net_sockets[i].id == sock_id) {
                s_net_sockets[i].active = false;
                if (s_net_sockets[i].s != INVALID_SOCKET) {
                    closesocket(s_net_sockets[i].s);
                    s_net_sockets[i].s = INVALID_SOCKET;
                }
                s_net_sockets[i].type = NET_SOCK_FREE;
                break;
            }
        }
        LeaveCriticalSection(&s_net_cs);
        snprintf(response, max_resp, "{\"success\":true}");

    } else {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Unknown net action: '%s'\"}", action);
    }
}

void cleanup_net_module(void) {
    ensure_net_cs();
    EnterCriticalSection(&s_net_cs);
    for (int i = 0; i < MAX_NET_SOCKETS; i++) {
        if (s_net_sockets[i].s != INVALID_SOCKET) {
            s_net_sockets[i].active = false;
            closesocket(s_net_sockets[i].s);
            s_net_sockets[i].s = INVALID_SOCKET;
            s_net_sockets[i].type = NET_SOCK_FREE;
        }
    }
    LeaveCriticalSection(&s_net_cs);
}
