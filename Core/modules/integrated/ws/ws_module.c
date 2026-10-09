/**
 * ============================================================================
 * RDevCore/modules/integrated/ws/ws_module.c
 * ============================================================================
 * Node.js 'ws' WebSocket Module C Bridge Implementation
 * Native WebSocket Server & Client powered by Cesanta Mongoose
 * ============================================================================
 */

#include "ws_module.h"
#include "ritawapp_modules.h"
#include "rita_mongoose_net.h"
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int s_ws_server_counter = 1;

void register_ws_module(void) {
    ritawapp_register_module("ws", handle_ws_action);
}

void handle_ws_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp) {
    (void)window;
    if (!action || !json_request || !response || max_resp == 0) return;

    if (strcmp(action, "createServer") == 0) {
        char port_str[32] = "8080";
        char host_str[128] = "0.0.0.0";
        json_extract_arg(json_request, 0, port_str, sizeof(port_str));
        json_extract_arg(json_request, 1, host_str, sizeof(host_str));

        int port = atoi(port_str);
        if (port <= 0) port = 8080;

        char listen_url[256];
        snprintf(listen_url, sizeof(listen_url), "ws://%s:%d", host_str, port);

        int server_id = s_ws_server_counter++;
        int ret = rita_mongoose_ws_listen(listen_url, server_id);

        if (ret >= 0) {
            snprintf(response, max_resp, "{\"success\":true,\"serverId\":%d,\"port\":%d,\"url\":\"%s\"}", server_id, port, listen_url);
        } else {
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Failed to bind WebSocket server on %s\"}", listen_url);
        }

    } else if (strcmp(action, "closeServer") == 0) {
        char srv_id_str[32] = "0";
        json_extract_arg(json_request, 0, srv_id_str, sizeof(srv_id_str));
        int server_id = atoi(srv_id_str);

        bool ok = rita_mongoose_ws_close_server(server_id);
        snprintf(response, max_resp, "{\"success\":%s}", ok ? "true" : "false");

    } else if (strcmp(action, "send") == 0) {
        char conn_id_str[32] = "0";
        char data[32768] = {0};
        char is_binary_str[16] = "false";

        json_extract_arg(json_request, 0, conn_id_str, sizeof(conn_id_str));
        json_extract_arg(json_request, 1, data, sizeof(data));
        json_extract_arg(json_request, 2, is_binary_str, sizeof(is_binary_str));

        int conn_id = atoi(conn_id_str);
        bool is_binary = (strcmp(is_binary_str, "true") == 0);

        bool ok = rita_mongoose_ws_send(conn_id, data, strlen(data), is_binary);
        snprintf(response, max_resp, "{\"success\":%s}", ok ? "true" : "false");

    } else if (strcmp(action, "close") == 0) {
        char conn_id_str[32] = "0";
        json_extract_arg(json_request, 0, conn_id_str, sizeof(conn_id_str));
        int conn_id = atoi(conn_id_str);

        bool ok = rita_mongoose_ws_close_conn(conn_id);
        snprintf(response, max_resp, "{\"success\":%s}", ok ? "true" : "false");

    } else if (strcmp(action, "poll") == 0 || strcmp(action, "pollEvents") == 0) {
        char srv_id_str[32] = "0";
        json_extract_arg(json_request, 0, srv_id_str, sizeof(srv_id_str));
        int server_id = atoi(srv_id_str);

        rita_mongoose_ws_poll_events(server_id, response, max_resp);

    } else {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Unknown ws action: '%s'\"}", action);
    }
}
