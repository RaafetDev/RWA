/**
 * ============================================================================
 * RDevCore/modules/integrated/process/process_module.c
 * ============================================================================
 * Node.js-compatible Process Native C Implementation
 * ============================================================================
 */

#include "process_module.h"
#include "ritawapp_modules.h"
#include <windows.h>
#include <psapi.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void register_process_module(void) {
    ritawapp_register_module("process", handle_process_action);
}

void handle_process_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp) {
    RW_UNUSED(window);
    if (strcmp(action, "getInfo") == 0) {
        DWORD pid = GetCurrentProcessId();
        char cwd[MAX_PATH] = {0};
        GetCurrentDirectoryA(MAX_PATH, cwd);

        PROCESS_MEMORY_COUNTERS pmc;
        GetProcessMemoryInfo(GetCurrentProcess(), &pmc, sizeof(pmc));

        char esc_cwd[MAX_PATH * 2] = {0};
        escape_json_string(cwd, esc_cwd, sizeof(esc_cwd));

        snprintf(response, max_resp,
            "{\"success\":true,\"data\":{"
            "\"pid\":%lu,"
            "\"platform\":\"win32\","
            "\"arch\":\"x64\","
            "\"cwd\":\"%s\","
            "\"memoryUsage\":{\"rss\":%llu,\"heapTotal\":%llu,\"heapUsed\":%llu}"
            "}}",
            pid,
            esc_cwd,
            (unsigned long long)pmc.WorkingSetSize,
            (unsigned long long)pmc.PagefileUsage,
            (unsigned long long)pmc.PeakWorkingSetSize
        );
    } else if (strcmp(action, "cwd") == 0) {
        char cwd[MAX_PATH] = {0};
        GetCurrentDirectoryA(MAX_PATH, cwd);
        char esc[MAX_PATH * 2] = {0};
        escape_json_string(cwd, esc, sizeof(esc));
        snprintf(response, max_resp, "{\"success\":true,\"data\":\"%s\"}", esc);
    } else if (strcmp(action, "getEnv") == 0) {
        char key[128] = {0};
        json_extract_arg(json_request, 0, key, sizeof(key));
        char val[2048] = {0};
        DWORD len = GetEnvironmentVariableA(key, val, sizeof(val));
        if (len > 0) {
            char esc[4096] = {0};
            escape_json_string(val, esc, sizeof(esc));
            snprintf(response, max_resp, "{\"success\":true,\"data\":\"%s\"}", esc);
        } else {
            snprintf(response, max_resp, "{\"success\":true,\"data\":null}");
        }
    } else if (strcmp(action, "exit") == 0) {
        char code_str[16] = {0};
        json_extract_arg(json_request, 0, code_str, sizeof(code_str));
        int code = atoi(code_str);
        snprintf(response, max_resp, "{\"success\":true}");
        ExitProcess((UINT)code);
    } else {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Unknown process action: '%s'\"}", action);
    }
}
