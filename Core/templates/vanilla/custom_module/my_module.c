/**
 * ============================================================================
 * custom_module/my_module.c
 * ============================================================================
 * Example Custom Native C Module for RitaWapp (Vanilla JS).
 * ============================================================================
 */

#include "my_module.h"
#include <winsock2.h>
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Include RitaWapp module system interface
#include "../Core/runtime/rpc/ritawapp_modules.h"

void handle_my_custom_module(
    size_t window,
    const char* action,
    const char* json_request,
    char* response,
    size_t max_resp
) {
    RW_UNUSED(window);
    RW_UNUSED(json_request);

    // 1. Action: "hello"
    if (strcmp(action, "hello") == 0) {
        snprintf(response, max_resp,
            "{\"success\":true,\"data\":{\"message\":\"Hello from Vanilla Custom C Module!\",\"version\":\"1.0.0\"}}"
        );
        return;
    }

    // 2. Action: "addNumbers"
    if (strcmp(action, "addNumbers") == 0) {
        int a = 100;
        int b = 200;
        snprintf(response, max_resp,
            "{\"success\":true,\"data\":{\"result\":%d}}",
            a + b
        );
        return;
    }

    // 3. Action: "getSystemTicks"
    if (strcmp(action, "getSystemTicks") == 0) {
        DWORD ticks = GetTickCount();
        snprintf(response, max_resp,
            "{\"success\":true,\"data\":{\"tickCount\":%lu}}",
            (unsigned long)ticks
        );
        return;
    }

    // Unknown action error response
    snprintf(response, max_resp,
        "{\"success\":false,\"error\":\"Unknown action '%s' in myModule\"}",
        action ? action : "NULL"
    );
}

/**
 * Custom module registration hook. Overrides weak symbol in Core/runtime/rpc/ritawapp_modules.c.
 */
void register_custom_user_modules(void) {
    ritawapp_register_module("myModule", handle_my_custom_module);
}
