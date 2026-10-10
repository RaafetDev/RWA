/**
 * ============================================================================
 * RDevCore/modules/integrated/dgram/dgram_module.c
 * ============================================================================
 * Node.js-compatible 'dgram' Module (UDP Sockets) Implementation
 * ============================================================================
 */

#include "dgram_module.h"
#include "ritawapp_modules.h"
#include "../../../runtime/webui/include/webui.h"
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

#define MAX_DGRAM_SOCKETS 32

typedef struct {
    int id;
    SOCKET s;
    size_t window;
    HANDLE hThread;
    bool active;
    int port;
    char address[64];
} DgramSocketEntry;

static DgramSocketEntry s_dgram_sockets[MAX_DGRAM_SOCKETS];
static CRITICAL_SECTION s_dgram_cs;
static bool s_dgram_cs_init = false;
static int s_next_dgram_id = 1;

static void ensure_dgram_cs(void) {
    if (!s_dgram_cs_init) {
        WSADATA wsa;
        WSAStartup(MAKEWORD(2, 2), &wsa);
        InitializeCriticalSection(&s_dgram_cs);
        s_dgram_cs_init = true;
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

static const char b64_table_dg[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static void dgram_base64_encode(const unsigned char* in, size_t in_len, char* out, size_t max_out) {
    size_t out_len = 0;
    for (size_t i = 0; i < in_len; i += 3) {
        if (out_len + 4 >= max_out) break;
        uint32_t octet_a = i < in_len ? in[i] : 0;
        uint32_t octet_b = (i + 1) < in_len ? in[i + 1] : 0;
        uint32_t octet_c = (i + 2) < in_len ? in[i + 2] : 0;
        uint32_t triple = (octet_a << 16) + (octet_b << 8) + octet_c;

        out[out_len++] = b64_table_dg[(triple >> 18) & 0x3F];
        out[out_len++] = b64_table_dg[(triple >> 12) & 0x3F];
        out[out_len++] = (i + 1 < in_len) ? b64_table_dg[(triple >> 6) & 0x3F] : '=';
        out[out_len++] = (i + 2 < in_len) ? b64_table_dg[triple & 0x3F] : '=';
    }
    out[out_len] = '\0';
}

static DWORD WINAPI DgramRecvThread(LPVOID param) {
    DgramSocketEntry* entry = (DgramSocketEntry*)param;
    char buf[8192];
    char b64[12000];

    while (entry->active && entry->s != INVALID_SOCKET) {
        struct sockaddr_in sender_addr;
        int sender_len = sizeof(sender_addr);
        int n = recvfrom(entry->s, buf, sizeof(buf), 0, (struct sockaddr*)&sender_addr, &sender_len);
        if (n > 0) {
            dgram_base64_encode((unsigned char*)buf, (size_t)n, b64, sizeof(b64));
            char sender_ip[64];
            strncpy(sender_ip, inet_ntoa(sender_addr.sin_addr), sizeof(sender_ip) - 1);
            sender_ip[sizeof(sender_ip) - 1] = '\0';
            int sender_port = ntohs(sender_addr.sin_port);

            char js[13000];
            snprintf(js, sizeof(js),
                "if (typeof window !== 'undefined' && window.__rita_dgram_dispatch) {"
                "  window.__rita_dgram_dispatch(%d, 'message', '%s', '%s', %d, 'IPv4', %d);"
                "}",
                entry->id, b64, sender_ip, sender_port, n);
            webui_run(entry->window, js);
        } else {
            break;
        }
    }

    if (entry->active) {
        char js[256];
        snprintf(js, sizeof(js),
            "if (typeof window !== 'undefined' && window.__rita_dgram_dispatch) {"
            "  window.__rita_dgram_dispatch(%d, 'close');"
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

void register_dgram_module(void) {
    ensure_dgram_cs();
    ritawapp_register_module("dgram", handle_dgram_action);
}

void handle_dgram_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp) {
    RW_UNUSED(window);
    ensure_dgram_cs();

    if (strcmp(action, "bind") == 0) {
        char port_str[16] = {0};
        char addr_str[64] = {0};
        json_extract_arg(json_request, 0, port_str, sizeof(port_str));
        json_extract_arg(json_request, 1, addr_str, sizeof(addr_str));
        int port = atoi(port_str);
        if (port < 0) port = 0;
        if (!addr_str[0] || strcmp(addr_str, "0.0.0.0") == 0) strncpy(addr_str, "127.0.0.1", sizeof(addr_str) - 1);

        ensure_dgram_cs();
        SOCKET s = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
        if (s == INVALID_SOCKET) {
            int wsa_err = WSAGetLastError();
            char err_desc[256] = {0};
            get_wsa_error_desc(wsa_err, err_desc, sizeof(err_desc));
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Failed to create UDP socket: %s\",\"wsaError\":%d}", err_desc, wsa_err);
            return;
        }

        int opt = 1;
        setsockopt(s, SOL_SOCKET, SO_EXCLUSIVEADDRUSE, (const char*)&opt, sizeof(opt));

        struct sockaddr_in sa;
        memset(&sa, 0, sizeof(sa));
        sa.sin_family = AF_INET;
        sa.sin_port = htons((unsigned short)port);
        sa.sin_addr.s_addr = inet_addr(addr_str);
        if (sa.sin_addr.s_addr == INADDR_NONE || sa.sin_addr.s_addr == htonl(INADDR_ANY)) {
            sa.sin_addr.s_addr = inet_addr("127.0.0.1");
        }

        int bind_res = bind(s, (struct sockaddr*)&sa, sizeof(sa));
        int initial_wsa_err = (bind_res != 0) ? WSAGetLastError() : 0;
        if (bind_res != 0) {
            // Port busy: retry up to 10 following ports
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
                snprintf(response, max_resp, "{\"success\":false,\"error\":\"Failed to bind UDP port %d: %s\",\"wsaError\":%d}", port, err_desc, initial_wsa_err);
                return;
            }
        }

        // Get actual bound port
        struct sockaddr_in bound_sa;
        int bound_len = sizeof(bound_sa);
        if (getsockname(s, (struct sockaddr*)&bound_sa, &bound_len) == 0) {
            port = ntohs(bound_sa.sin_port);
        }

        EnterCriticalSection(&s_dgram_cs);
        DgramSocketEntry* entry = NULL;
        for (int i = 0; i < MAX_DGRAM_SOCKETS; i++) {
            if (!s_dgram_sockets[i].active && s_dgram_sockets[i].s == 0) {
                entry = &s_dgram_sockets[i];
                entry->id = s_next_dgram_id++;
                entry->s = s;
                entry->window = window;
                entry->active = true;
                entry->port = port;
                strncpy(entry->address, addr_str, sizeof(entry->address) - 1);
                break;
            }
        }
        LeaveCriticalSection(&s_dgram_cs);

        if (!entry) {
            closesocket(s);
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Max UDP sockets reached\"}");
            return;
        }

        entry->hThread = CreateThread(NULL, 0, DgramRecvThread, entry, 0, NULL);
        snprintf(response, max_resp, "{\"success\":true,\"data\":{\"id\":%d,\"port\":%d,\"address\":\"%s\"}}", entry->id, port, addr_str);

    } else if (strcmp(action, "send") == 0) {
        char id_str[16] = {0};
        char msg[4096] = {0};
        char port_str[16] = {0};
        char host[128] = {0};
        json_extract_arg(json_request, 0, id_str, sizeof(id_str));
        json_extract_arg(json_request, 1, msg, sizeof(msg));
        json_extract_arg(json_request, 2, port_str, sizeof(port_str));
        json_extract_arg(json_request, 3, host, sizeof(host));

        int sock_id = atoi(id_str);
        int port = atoi(port_str);
        if (!host[0]) strncpy(host, "127.0.0.1", sizeof(host) - 1);

        EnterCriticalSection(&s_dgram_cs);
        DgramSocketEntry* entry = NULL;
        for (int i = 0; i < MAX_DGRAM_SOCKETS; i++) {
            if (s_dgram_sockets[i].id == sock_id && s_dgram_sockets[i].active) {
                entry = &s_dgram_sockets[i];
                break;
            }
        }

        if (!entry || entry->s == INVALID_SOCKET) {
            LeaveCriticalSection(&s_dgram_cs);
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"UDP socket not active\"}");
            return;
        }

        struct sockaddr_in dest;
        memset(&dest, 0, sizeof(dest));
        dest.sin_family = AF_INET;
        dest.sin_port = htons((unsigned short)port);
        dest.sin_addr.s_addr = inet_addr(host);
        if (dest.sin_addr.s_addr == INADDR_NONE) {
            struct hostent* he = gethostbyname(host);
            if (he) {
                memcpy(&dest.sin_addr, he->h_addr_list[0], he->h_length);
            }
        }

        int sent = sendto(entry->s, msg, (int)strlen(msg), 0, (struct sockaddr*)&dest, sizeof(dest));
        LeaveCriticalSection(&s_dgram_cs);

        snprintf(response, max_resp, "{\"success\":%s,\"bytesSent\":%d}", (sent >= 0) ? "true" : "false", sent);

    } else if (strcmp(action, "close") == 0) {
        char id_str[16] = {0};
        json_extract_arg(json_request, 0, id_str, sizeof(id_str));
        int sock_id = atoi(id_str);

        EnterCriticalSection(&s_dgram_cs);
        for (int i = 0; i < MAX_DGRAM_SOCKETS; i++) {
            if (s_dgram_sockets[i].id == sock_id) {
                s_dgram_sockets[i].active = false;
                if (s_dgram_sockets[i].s != INVALID_SOCKET) {
                    closesocket(s_dgram_sockets[i].s);
                    s_dgram_sockets[i].s = INVALID_SOCKET;
                }
                s_dgram_sockets[i].id = 0;
                break;
            }
        }
        LeaveCriticalSection(&s_dgram_cs);
        snprintf(response, max_resp, "{\"success\":true}");

    } else {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Unknown dgram action: '%s'\"}", action);
    }
}

void cleanup_dgram_module(void) {
    ensure_dgram_cs();
    EnterCriticalSection(&s_dgram_cs);
    for (int i = 0; i < MAX_DGRAM_SOCKETS; i++) {
        if (s_dgram_sockets[i].s != INVALID_SOCKET && s_dgram_sockets[i].s != 0) {
            s_dgram_sockets[i].active = false;
            closesocket(s_dgram_sockets[i].s);
            s_dgram_sockets[i].s = INVALID_SOCKET;
            s_dgram_sockets[i].id = 0;
        }
    }
    LeaveCriticalSection(&s_dgram_cs);
}
