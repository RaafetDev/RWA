/**
 * ============================================================================
 * RDevCore/modules/integrated/shell/shell_module.c
 * ============================================================================
 * Process Execution & Shell Integration Native C Implementation
 * ============================================================================
 */

#include "shell_module.h"
#include "ritawapp_modules.h"
#include <windows.h>
#include <shellapi.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void register_shell_module(void) {
    ritawapp_register_module("shell", handle_shell_action);
}

void handle_shell_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp) {
    RW_UNUSED(window);
    if (strcmp(action, "exec") == 0) {
        char cmd[2048] = {0};
        json_extract_arg(json_request, 0, cmd, sizeof(cmd));

        char full_cmd[2560];
        snprintf(full_cmd, sizeof(full_cmd), "cmd.exe /c \"%s\" 2>&1", cmd);

        FILE* pipe = _popen(full_cmd, "rt");
        if (!pipe) {
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Failed to spawn process pipe\"}");
            return;
        }

        char* output = (char*)malloc(1024 * 1024); // 1MB buffer
        if (!output) {
            _pclose(pipe);
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Out of memory\"}");
            return;
        }
        output[0] = '\0';
        size_t total_read = 0;

        char chunk[1024];
        while (fgets(chunk, sizeof(chunk), pipe) != NULL) {
            size_t c_len = strlen(chunk);
            if (total_read + c_len < 1024 * 1024 - 1) {
                strcat(output, chunk);
                total_read += c_len;
            }
        }
        int code = _pclose(pipe);

        char* escaped = (char*)malloc(total_read * 2 + 64);
        if (escaped) {
            escape_json_string(output, escaped, total_read * 2 + 64);
            snprintf(response, max_resp, "{\"success\":true,\"data\":{\"stdout\":\"%s\",\"stderr\":\"\",\"exitCode\":%d}}", escaped, code);
            free(escaped);
        } else {
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Out of memory escaping stdout\"}");
        }
        free(output);
    } else if (strcmp(action, "openExternal") == 0) {
        char target[MAX_PATH * 2] = {0};
        json_extract_arg(json_request, 0, target, sizeof(target));
        HINSTANCE hInst = ShellExecuteA(NULL, "open", target, NULL, NULL, SW_SHOWNORMAL);
        snprintf(response, max_resp, "{\"success\":%s}", ((INT_PTR)hInst > 32) ? "true" : "false");
    } else if (strcmp(action, "showItemInFolder") == 0) {
        char file_path[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, file_path, sizeof(file_path));
        char params[MAX_PATH + 32];
        snprintf(params, sizeof(params), "/select,\"%s\"", file_path);
        HINSTANCE hInst = ShellExecuteA(NULL, "open", "explorer.exe", params, NULL, SW_SHOWNORMAL);
        snprintf(response, max_resp, "{\"success\":%s}", ((INT_PTR)hInst > 32) ? "true" : "false");
    } else {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Unknown shell action: '%s'\"}", action);
    }
}
