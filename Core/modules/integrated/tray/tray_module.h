/**
 * ============================================================================
 * RDevCore/modules/integrated/tray/tray_module.h
 * ============================================================================
 * Native Windows System Tray Module Header
 * ============================================================================
 */

#ifndef RITAWAPP_TRAY_MODULE_H
#define RITAWAPP_TRAY_MODULE_H

#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

void register_tray_module(void);
void handle_tray_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp);

/**
 * Initializes the System Tray icon for the application window.
 */
bool ritawapp_tray_init(size_t window, const char* tooltip, const char* icon_path);

/**
 * Destroys and removes the System Tray icon.
 */
void ritawapp_tray_destroy(void);

/**
 * Checks whether minimizing the window should hide it to the system tray.
 */
bool ritawapp_tray_is_hide_to_tray_enabled(void);

/**
 * Sets whether minimizing the window should hide it to the system tray.
 */
void ritawapp_tray_set_hide_to_tray(bool enable);

/**
 * Shows and brings the application window to foreground.
 */
void ritawapp_tray_show_window(size_t window);

/**
 * Hides the application window to the tray.
 */
void ritawapp_tray_hide_window(size_t window);

#ifdef __cplusplus
}
#endif

#endif // RITAWAPP_TRAY_MODULE_H
