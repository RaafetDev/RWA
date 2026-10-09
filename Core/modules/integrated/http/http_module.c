/**
 * ============================================================================
 * RDevCore/modules/integrated/http/http_module.c
 * ============================================================================
 * Real Node.js-compatible 'http' & 'https' Module Implementation
 * Powered by Cesanta Mongoose (real multi-client HTTP server & client)
 * ============================================================================
 */

#include "http_module.h"
#include "ritawapp_modules.h"
#include "rita_mongoose_net.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

static int s_http_server_counter = 1;

void register_http_module(void) {
    rita_mongoose_start();
    ritawapp_register_module("http", handle_http_action);
}

void handle_http_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp) {
    (void)window;
    if (!action || !json_request || !response || max_resp == 0) return;

    if (strcmp(action, "request") == 0 || strcmp(action, "get") == 0 || strcmp(action, "post") == 0) {
        char url[2048] = {0};
        char method[16] = "GET";
        char headers[4096] = {0};
        char body[65536] = {0};

        json_extract_string(json_request, "url", url, sizeof(url));
        if (!url[0]) json_extract_arg(json_request, 0, url, sizeof(url));

        json_extract_string(json_request, "method", method, sizeof(method));
        if (strcmp(action, "post") == 0 && strcmp(method, "GET") == 0) {
            strncpy(method, "POST", sizeof(method) - 1);
        }

        json_extract_string(json_request, "headers", headers, sizeof(headers));
        json_extract_string(json_request, "body", body, sizeof(body));

        if (!url[0]) {
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Missing URL parameter\"}");
            return;
        }

        rita_mongoose_http_request(url, method, headers[0] ? headers : NULL, body[0] ? body : NULL, response, max_resp);

    } else if (strcmp(action, "createServer") == 0 || strcmp(action, "listen") == 0) {
        char port_str[32] = "8080";
        char host_str[128] = "0.0.0.0";
        json_extract_arg(json_request, 0, port_str, sizeof(port_str));
        json_extract_arg(json_request, 1, host_str, sizeof(host_str));

        int port = atoi(port_str);
        if (port <= 0) port = 8080;

        char listen_url[256];
        snprintf(listen_url, sizeof(listen_url), "http://%s:%d", host_str, port);

        int server_id = s_http_server_counter++;
        int ret = rita_mongoose_http_listen(listen_url, server_id);

        if (ret >= 0) {
            snprintf(response, max_resp, "{\"success\":true,\"serverId\":%d,\"port\":%d,\"url\":\"%s\"}", server_id, port, listen_url);
        } else {
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Failed to bind HTTP server to %s\"}", listen_url);
        }

    } else if (strcmp(action, "respond") == 0) {
        char req_id_str[32] = "0";
        char status_str[16] = "200";
        char body[65536] = {0};

        json_extract_arg(json_request, 0, req_id_str, sizeof(req_id_str));
        json_extract_arg(json_request, 1, status_str, sizeof(status_str));
        json_extract_arg(json_request, 2, body, sizeof(body));

        int req_id = atoi(req_id_str);
        int status = atoi(status_str);
        if (status <= 0) status = 200;

        bool ok = rita_mongoose_http_respond(req_id, status, NULL, body, strlen(body));
        snprintf(response, max_resp, "{\"success\":%s}", ok ? "true" : "false");

    } else if (strcmp(action, "poll") == 0 || strcmp(action, "pollRequests") == 0) {
        char server_id_str[32] = "0";
        json_extract_arg(json_request, 0, server_id_str, sizeof(server_id_str));
        int server_id = atoi(server_id_str);

        rita_mongoose_http_poll_requests(server_id, response, max_resp);

    } else if (strcmp(action, "close") == 0) {
        char server_id_str[32] = "0";
        json_extract_arg(json_request, 0, server_id_str, sizeof(server_id_str));
        int server_id = atoi(server_id_str);

        bool ok = rita_mongoose_http_close(server_id);
        snprintf(response, max_resp, "{\"success\":%s}", ok ? "true" : "false");

    } else {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Unknown http action: '%s'\"}", action);
    }
}
