/**
 * ============================================================================
 * ritawapp-modules/sample_module/sample_module.c
 * ============================================================================
 * Example Custom Native C Module for RitaWapp
 * ============================================================================
 */

#include "sample_module.h"
#include "ritawapp_modules.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

void handle_sample_module(
    size_t window,
    const char* action,
    const char* json_request,
    char* response,
    size_t max_resp
) {
    (void)window;

    if (strcmp(action, "greet") == 0) {
        char name[256] = "World";
        json_extract_string(json_request, "name", name, sizeof(name));
        snprintf(response, max_resp, "{\"success\":true,\"message\":\"Hello from Native C Custom Module, %s!\"}", name);
        return;
    }

    if (strcmp(action, "addNumbers") == 0) {
        char a_str[64] = "0", b_str[64] = "0";
        json_extract_string(json_request, "a", a_str, sizeof(a_str));
        json_extract_string(json_request, "b", b_str, sizeof(b_str));
        double a = atof(a_str);
        double b = atof(b_str);
        snprintf(response, max_resp, "{\"success\":true,\"result\":%f}", a + b);
        return;
    }

    if (strcmp(action, "getInfo") == 0) {
        snprintf(response, max_resp,
            "{\"success\":true,\"module\":\"sample_module\",\"version\":\"1.0.0\",\"type\":\"custom_native_c\"}");
        return;
    }

    snprintf(response, max_resp, "{\"success\":false,\"error\":\"Unknown action '%s' in sample_module\"}", action);
}
