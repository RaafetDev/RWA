/**
 * ============================================================================
 * RDevCore/ritawapp_modules.h
 * ============================================================================
 * RitaWapp Extensible Native C Module System
 *
 * Allows built-in integrated modules and user custom modules to register
 * C callback handlers dynamically, automatically routed by the WebUI RPC bridge.
 * ============================================================================
 */

#ifndef RITAWAPP_MODULES_SYSTEM_H
#define RITAWAPP_MODULES_SYSTEM_H

#include <stddef.h>
#include <stdbool.h>
#include <stdint.h>
#include "../webui/include/webui.h"

#ifdef __cplusplus
extern "C" {
#endif

#define RITA_MAX_MODULES 64
#define RITA_MAX_RESPONSE_LEN (2 * 1024 * 1024) // 2MB response capacity

#ifndef RW_UNUSED
#define RW_UNUSED(x) ((void)(x))
#endif

/**
 * Signature for native module dispatchers.
 */
typedef void (*RitaWappModuleHandler)(
    size_t window,
    const char* action,
    const char* json_request,
    char* response,
    size_t max_resp
);

/**
 * Initializes the RitaWapp native module system for a given WebUI window context.
 */
void ritawapp_modules_init(size_t window);

/**
 * Registers a native module handler under the specified module name.
 * e.g. ritawapp_register_module("fs", handle_fs_module);
 */
bool ritawapp_register_module(const char* name, RitaWappModuleHandler handler);

/**
 * Central RPC entry point called by webui_bind.
 */
void ritawapp_dispatch_rpc(webui_event_t* e);

/**
 * Sets whether the current runtime window is in native frameless mode.
 */
void ritawapp_set_frameless_state(bool is_frameless);

/**
 * Gets the current frameless state.
 */
bool ritawapp_get_frameless_state(void);

/**
 * Returns the total count of registered native modules.
 */
size_t ritawapp_get_registered_module_count(void);

/**
 * Resolves the native Win32 window HWND handle for an active WebUI window.
 */
void* ritawapp_get_window_hwnd(size_t window);

/**
 * Toggles maximize and restore state for the window.
 */
void ritawapp_window_toggle_maximize(size_t window);

/**
 * Restores the window from maximized state.
 */
void ritawapp_window_restore(size_t window);

/**
 * Checks whether the window is currently maximized.
 */
bool ritawapp_window_is_maximized(size_t window);

/**
 * Initiates clean graceful termination: stops servers, cleans up sockets,
 * posts quit message, and starts a 2s safety timer for ExitProcess.
 */
void ritawapp_request_graceful_exit(size_t window);

// JSON helper utilities for module implementations
bool json_extract_string(const char* json, const char* key, char* out_val, size_t max_len);
bool json_extract_arg(const char* json, size_t index, char* out_val, size_t max_len);
void escape_json_string(const char* input, char* output, size_t max_out);

#ifdef __cplusplus
}
#endif

#endif // RITAWAPP_MODULES_SYSTEM_H
