/**
 * ============================================================================
 * custom_module/my_module.c
 * ============================================================================
 * Example Custom Native C Module for RitaWapp.
 *
 * How this works:
 * 1. The RitaWapp compiler automatically scans the `custom_module/` folder
 *    and compiles all `.c` files into your native executable.
 * 2. RitaWapp runtime declares a weak hook: `register_custom_user_modules(void)`.
 *    Defining it here registers your custom module with the WebUI RPC router.
 * 3. Frontend calls `window.rita_module_call(JSON.stringify({ module: "myModule", action: "hello", args: ["World"] }))`.
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
            "{\"success\":true,\"data\":{\"message\":\"Hello from Custom Native C Module!\",\"version\":\"1.0.0\"}}"
        );
        return;
    }

    // 2. Action: "addNumbers" - Simple computational logic
    if (strcmp(action, "addNumbers") == 0) {
        // In a real module, parse parameters from json_request.
        // For demonstration, perform sample calculation:
        int a = 42;
        int b = 58;
        snprintf(response, max_resp,
            "{\"success\":true,\"data\":{\"result\":%d}}",
            a + b
        );
        return;
    }

    // 3. Action: "getSystemTicks" - Direct Win32 API invocation
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
 * Strong implementation of the custom module registration hook.
 * This overrides the weak symbol in Core/runtime/rpc/ritawapp_modules.c.
 */
void register_custom_user_modules(void) {
    // Register the module under name "myModule"
    ritawapp_register_module("myModule", handle_my_custom_module);
}
