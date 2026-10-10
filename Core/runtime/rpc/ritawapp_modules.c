/**
 * ============================================================================
 * RDevCore/modules/system/ritawapp_modules.c
 * ============================================================================
 * Production RitaWapp Native Module System Dispatcher
 * ============================================================================
 */

#include "ritawapp_modules.h"
#include "../core/app_credentials.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <windows.h>

typedef struct {
    char name[64];
    RitaWappModuleHandler handler;
} RegisteredModule;

static RegisteredModule s_registry[RITA_MAX_MODULES];
static size_t s_registered_count = 0;
static bool s_is_frameless = false;
static size_t s_active_window = 0;

void ritawapp_set_frameless_state(bool is_frameless) {
    s_is_frameless = is_frameless;
}

bool ritawapp_get_frameless_state(void) {
    return s_is_frameless;
}

size_t ritawapp_get_registered_module_count(void) {
    return s_registered_count;
}

bool ritawapp_register_module(const char* name, RitaWappModuleHandler handler) {
    if (!name || !handler || s_registered_count >= RITA_MAX_MODULES) {
        return false;
    }

    for (size_t i = 0; i < s_registered_count; i++) {
        if (strcmp(s_registry[i].name, name) == 0) {
            s_registry[i].handler = handler; // Overwrite
            return true;
        }
    }

    strncpy(s_registry[s_registered_count].name, name, sizeof(s_registry[s_registered_count].name) - 1);
    s_registry[s_registered_count].handler = handler;
    s_registered_count++;
    return true;
}

static RECT s_prev_restore_rect = { 0, 0, 0, 0 };
static bool s_is_custom_maximized = false;
static DWORD s_last_maximize_tick = 0;

typedef struct {
    DWORD pid;
    HWND hwnd;
} FindProcessWindowData;

static BOOL CALLBACK EnumProcessWindowsProc(HWND hwnd, LPARAM lParam) {
    FindProcessWindowData* data = (FindProcessWindowData*)lParam;
    DWORD processId = 0;
    GetWindowThreadProcessId(hwnd, &processId);
    if (processId == data->pid && IsWindowVisible(hwnd)) {
        HWND root = GetAncestor(hwnd, GA_ROOT);
        if (root && IsWindowVisible(root)) {
            data->hwnd = root;
            return FALSE;
        }
        data->hwnd = hwnd;
        return FALSE;
    }
    return TRUE;
}

void* ritawapp_get_window_hwnd(size_t window) {
    DWORD curPid = GetCurrentProcessId();
    HWND hwnd = NULL;

    // 1. Primary: Direct query via WebUI official Win32 HWND API
    if (window > 0) {
        hwnd = (HWND)webui_win32_get_hwnd(window);
        if (!hwnd) hwnd = (HWND)webui_get_hwnd(window);
    }

    // 2. Fallback: EnumWindows for visible root window belonging to this process
    if (!hwnd || !IsWindow(hwnd)) {
        FindProcessWindowData data = { curPid, NULL };
        EnumWindows(EnumProcessWindowsProc, (LPARAM)&data);
        if (data.hwnd) hwnd = data.hwnd;
    }

    // 3. Fallback: Find "WebViewWindow" belonging to current process
    if (!hwnd || !IsWindow(hwnd)) {
        HWND h = FindWindowExA(NULL, NULL, "WebViewWindow", NULL);
        while (h) {
            DWORD pid = 0;
            GetWindowThreadProcessId(h, &pid);
            if (pid == curPid && IsWindowVisible(h)) {
                hwnd = h;
                break;
            }
            h = FindWindowExA(NULL, h, "WebViewWindow", NULL);
        }
    }

    // 4. Fallback: Active foreground window if belonging to this process
    if (!hwnd || !IsWindow(hwnd)) {
        HWND fg = GetForegroundWindow();
        if (fg) {
            DWORD fgPid = 0;
            GetWindowThreadProcessId(fg, &fgPid);
            if (fgPid == curPid) hwnd = fg;
        }
    }

    if (hwnd) {
        HWND root = GetAncestor(hwnd, GA_ROOT);
        if (root) hwnd = root;

        // Ensure the window style includes WS_MAXIMIZEBOX and WS_THICKFRAME
        // WebUI creates frameless windows with 0x90040000 (missing WS_MAXIMIZEBOX),
        // which prevents Windows from maximizing the window!
        LONG_PTR style = GetWindowLongPtr(hwnd, GWL_STYLE);
        if ((style & WS_MAXIMIZEBOX) == 0) {
            SetWindowLongPtr(hwnd, GWL_STYLE, style | WS_MAXIMIZEBOX | WS_MINIMIZEBOX | WS_SYSMENU | WS_THICKFRAME);
            SetWindowPos(hwnd, NULL, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
        }
        return (void*)hwnd;
    }

    return NULL;
}

bool ritawapp_window_is_maximized(size_t window) {
    HWND hwnd = (HWND)ritawapp_get_window_hwnd(window);
    if (!hwnd) return false;
    return IsZoomed(hwnd) || s_is_custom_maximized;
}

void ritawapp_window_restore(size_t window) {
    HWND hwnd = (HWND)ritawapp_get_window_hwnd(window);
    if (!hwnd) return;

    s_is_custom_maximized = false;
    ShowWindow(hwnd, SW_RESTORE);

    if (s_prev_restore_rect.right > s_prev_restore_rect.left &&
        s_prev_restore_rect.bottom > s_prev_restore_rect.top) {
        SetWindowPos(hwnd, NULL,
            s_prev_restore_rect.left,
            s_prev_restore_rect.top,
            s_prev_restore_rect.right - s_prev_restore_rect.left,
            s_prev_restore_rect.bottom - s_prev_restore_rect.top,
            SWP_NOZORDER | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
    }
}

void ritawapp_window_toggle_maximize(size_t window) {
    HWND hwnd = (HWND)ritawapp_get_window_hwnd(window);
    if (!hwnd) return;

    DWORD now = GetTickCount();
    if (now - s_last_maximize_tick < 250) {
        return; // Debounce rapid dual triggers
    }
    s_last_maximize_tick = now;

    if (ritawapp_window_is_maximized(window)) {
        ritawapp_window_restore(window);
    } else {
        GetWindowRect(hwnd, &s_prev_restore_rect);
        s_is_custom_maximized = true;

        ShowWindow(hwnd, SW_MAXIMIZE);

        if (!IsZoomed(hwnd)) {
            HMONITOR hMon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            if (hMon) {
                MONITORINFO mi;
                memset(&mi, 0, sizeof(mi));
                mi.cbSize = sizeof(mi);
                if (GetMonitorInfoA(hMon, &mi)) {
                    SetWindowPos(hwnd, NULL,
                        mi.rcWork.left,
                        mi.rcWork.top,
                        mi.rcWork.right - mi.rcWork.left,
                        mi.rcWork.bottom - mi.rcWork.top,
                        SWP_NOZORDER | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
                }
            }
        }
    }
}

#if defined(RITA_MODULE_NET_ENABLE) && RITA_MODULE_NET_ENABLE
void cleanup_net_module(void);
#endif
#if defined(RITA_MODULE_DGRAM_ENABLE) && RITA_MODULE_DGRAM_ENABLE
void cleanup_dgram_module(void);
#endif
#if defined(RITA_MODULE_DATABASE_ENABLE) && RITA_MODULE_DATABASE_ENABLE
void rita_sqlite_close(void);
#endif
#if (defined(RITA_MODULE_HTTP_ENABLE) && RITA_MODULE_HTTP_ENABLE) || (defined(RITA_MODULE_WS_ENABLE) && RITA_MODULE_WS_ENABLE)
void rita_mongoose_stop(void);
#endif

static DWORD WINAPI ExitTimeoutThread(LPVOID param) {
    (void)param;
    Sleep(2000);
    ExitProcess(0);
    return 0;
}

static volatile LONG s_exit_initiated = 0;

void ritawapp_request_graceful_exit(size_t window) {
    if (InterlockedCompareExchange(&s_exit_initiated, 1, 0) != 0) {
        return;
    }

    // 1. Start 2-second fallback watchdog thread before cleanup
    HANDLE hThread = CreateThread(NULL, 0, ExitTimeoutThread, NULL, 0, NULL);
    if (hThread) CloseHandle(hThread);

    // 2. Close Win32 window on UI thread
    HWND hwnd = (HWND)ritawapp_get_window_hwnd(window);
    if (hwnd) {
        PostMessage(hwnd, WM_CLOSE, 0, 0);
    }

    // 3. Stop network servers & cleanup modules
#if (defined(RITA_MODULE_HTTP_ENABLE) && RITA_MODULE_HTTP_ENABLE) || (defined(RITA_MODULE_WS_ENABLE) && RITA_MODULE_WS_ENABLE)
    rita_mongoose_stop();
#endif
#if defined(RITA_MODULE_NET_ENABLE) && RITA_MODULE_NET_ENABLE
    cleanup_net_module();
#endif
#if defined(RITA_MODULE_DGRAM_ENABLE) && RITA_MODULE_DGRAM_ENABLE
    cleanup_dgram_module();
#endif
#if defined(RITA_MODULE_DATABASE_ENABLE) && RITA_MODULE_DATABASE_ENABLE
    rita_sqlite_close();
#endif

    // 4. Post quit message to end event loop
    PostQuitMessage(0);
    webui_exit();
}

// Built-in official WebUI window controls callbacks
static void on_window_minimize(webui_event_t* e) {
    if (!e) return;
    HWND hwnd = (HWND)ritawapp_get_window_hwnd(e->window);
    if (hwnd) {
        PostMessage(hwnd, WM_SYSCOMMAND, SC_MINIMIZE, 0);
        ShowWindow(hwnd, SW_MINIMIZE);
    }
}

static void on_window_maximize(webui_event_t* e) {
    if (!e) return;
    ritawapp_window_toggle_maximize(e->window);
}

static void on_window_close(webui_event_t* e) {
    if (!e) return;
    ritawapp_request_graceful_exit(e->window);
}

// Built-in integrated module forward declarations (strictly declared when enabled)
#if defined(RITA_MODULE_FS_ENABLE) && RITA_MODULE_FS_ENABLE
void register_fs_module(void);
#endif
#if defined(RITA_MODULE_OS_ENABLE) && RITA_MODULE_OS_ENABLE
void register_os_module(void);
#endif
#if defined(RITA_MODULE_PROCESS_ENABLE) && RITA_MODULE_PROCESS_ENABLE
void register_process_module(void);
#endif
#if defined(RITA_MODULE_SHELL_ENABLE) && RITA_MODULE_SHELL_ENABLE
void register_shell_module(void);
#endif
#if defined(RITA_MODULE_APPWINDOW_ENABLE) && RITA_MODULE_APPWINDOW_ENABLE
void register_app_window_module(void);
#endif
#if defined(RITA_MODULE_NETWORK_ENABLE) && RITA_MODULE_NETWORK_ENABLE
void register_network_module(void);
#endif
#if defined(RITA_MODULE_DATABASE_ENABLE) && RITA_MODULE_DATABASE_ENABLE
void register_database_module(void);
#endif
#if defined(RITA_MODULE_UPDATE_ENABLE) && RITA_MODULE_UPDATE_ENABLE
void register_update_module(void);
#endif
#if defined(RITA_MODULE_CLOUDSYNC_ENABLE) && RITA_MODULE_CLOUDSYNC_ENABLE
void register_cloud_sync_module(void);
#endif
#if defined(RITA_MODULE_TRAY_ENABLE) && RITA_MODULE_TRAY_ENABLE
void register_tray_module(void);
#endif
#if defined(RITA_MODULE_NET_ENABLE) && RITA_MODULE_NET_ENABLE
void register_net_module(void);
#endif
#if defined(RITA_MODULE_DGRAM_ENABLE) && RITA_MODULE_DGRAM_ENABLE
void register_dgram_module(void);
#endif
#if defined(RITA_MODULE_HTTP_ENABLE) && RITA_MODULE_HTTP_ENABLE
void register_http_module(void);
#endif
#if defined(RITA_MODULE_WS_ENABLE) && RITA_MODULE_WS_ENABLE
void register_ws_module(void);
#endif
#if defined(RITA_MODULE_ADMZIP_ENABLE) && RITA_MODULE_ADMZIP_ENABLE
void register_adm_zip_module(void);
#endif

// TypeScript-integrated modules native stubs (path, fetch, express)
#if defined(RITA_MODULE_PATH_ENABLE) && RITA_MODULE_PATH_ENABLE
static void handle_path_module(size_t window, const char* action, const char* json_request, char* response, size_t max_resp) {
    RW_UNUSED(window); RW_UNUSED(action); RW_UNUSED(json_request);
    snprintf(response, max_resp, "{\"success\":true,\"data\":\"Path module active\"}");
}
static void register_path_module(void) {
    ritawapp_register_module("path", handle_path_module);
}
#endif

#if defined(RITA_MODULE_FETCH_ENABLE) && RITA_MODULE_FETCH_ENABLE
static void handle_fetch_module(size_t window, const char* action, const char* json_request, char* response, size_t max_resp) {
    RW_UNUSED(window); RW_UNUSED(action); RW_UNUSED(json_request);
    snprintf(response, max_resp, "{\"success\":true,\"data\":\"Fetch module active\"}");
}
static void register_fetch_module(void) {
    ritawapp_register_module("fetch", handle_fetch_module);
}
#endif

#if defined(RITA_MODULE_EXPRESS_ENABLE) && RITA_MODULE_EXPRESS_ENABLE
static void handle_express_module(size_t window, const char* action, const char* json_request, char* response, size_t max_resp) {
    RW_UNUSED(window); RW_UNUSED(action); RW_UNUSED(json_request);
    snprintf(response, max_resp, "{\"success\":true,\"data\":\"Express module active\"}");
}
static void register_express_module(void) {
    ritawapp_register_module("express", handle_express_module);
}
#endif

// User custom modules registration hook
void register_custom_user_modules(void) __attribute__((weak));
void register_custom_user_modules(void) {
    // Default empty implementation if no custom modules are present
}

void ritawapp_modules_init(size_t window) {
    s_active_window = window;

    // 1. Official WebUI Window Control Bindings
    webui_bind(window, "minimize", on_window_minimize);
    webui_bind(window, "maximize", on_window_maximize);
    webui_bind(window, "close", on_window_close);
    webui_bind(window, "close_win", on_window_close);

    // 2. Register Unified RPC Endpoints (both names for complete backward compatibility)
    webui_bind(window, "rita_module_call", ritawapp_dispatch_rpc);
    webui_bind(window, "rita_bridge_call", ritawapp_dispatch_rpc);

    // 3. Register Active Integrated Modules (Configured in RitaWapp-config.ts)
#if defined(RITA_MODULE_FS_ENABLE) && RITA_MODULE_FS_ENABLE
    register_fs_module();
#endif
#if defined(RITA_MODULE_OS_ENABLE) && RITA_MODULE_OS_ENABLE
    register_os_module();
#endif
#if defined(RITA_MODULE_PROCESS_ENABLE) && RITA_MODULE_PROCESS_ENABLE
    register_process_module();
#endif
#if defined(RITA_MODULE_SHELL_ENABLE) && RITA_MODULE_SHELL_ENABLE
    register_shell_module();
#endif
#if defined(RITA_MODULE_APPWINDOW_ENABLE) && RITA_MODULE_APPWINDOW_ENABLE
    register_app_window_module();
#endif
#if defined(RITA_MODULE_NETWORK_ENABLE) && RITA_MODULE_NETWORK_ENABLE
    register_network_module();
#endif
#if defined(RITA_MODULE_DATABASE_ENABLE) && RITA_MODULE_DATABASE_ENABLE
    register_database_module();
#endif
#if defined(RITA_MODULE_UPDATE_ENABLE) && RITA_MODULE_UPDATE_ENABLE
    register_update_module();
#endif
#if defined(RITA_MODULE_CLOUDSYNC_ENABLE) && RITA_MODULE_CLOUDSYNC_ENABLE
    register_cloud_sync_module();
#endif
#if defined(RITA_MODULE_TRAY_ENABLE) && RITA_MODULE_TRAY_ENABLE
    register_tray_module();
#endif
#if defined(RITA_MODULE_NET_ENABLE) && RITA_MODULE_NET_ENABLE
    register_net_module();
#endif
#if defined(RITA_MODULE_DGRAM_ENABLE) && RITA_MODULE_DGRAM_ENABLE
    register_dgram_module();
#endif
#if defined(RITA_MODULE_HTTP_ENABLE) && RITA_MODULE_HTTP_ENABLE
    register_http_module();
#endif
#if defined(RITA_MODULE_WS_ENABLE) && RITA_MODULE_WS_ENABLE
    register_ws_module();
#endif
#if defined(RITA_MODULE_ADMZIP_ENABLE) && RITA_MODULE_ADMZIP_ENABLE
    register_adm_zip_module();
#endif
#if defined(RITA_MODULE_PATH_ENABLE) && RITA_MODULE_PATH_ENABLE
    register_path_module();
#endif
#if defined(RITA_MODULE_FETCH_ENABLE) && RITA_MODULE_FETCH_ENABLE
    register_fetch_module();
#endif
#if defined(RITA_MODULE_EXPRESS_ENABLE) && RITA_MODULE_EXPRESS_ENABLE
    register_express_module();
#endif

    // 4. Register Custom User Modules (from ritawapp-modules/)
    register_custom_user_modules();
}

void ritawapp_dispatch_rpc(webui_event_t* e) {
    const char* raw_request = webui_get_string(e);
    if (!raw_request || strlen(raw_request) == 0) {
        webui_return_string(e, "{\"success\":false,\"error\":\"Empty RPC request payload\"}");
        return;
    }

    char module_name[64] = {0};
    char action_name[64] = {0};
    json_extract_string(raw_request, "module", module_name, sizeof(module_name));
    json_extract_string(raw_request, "action", action_name, sizeof(action_name));

    // Handle legacy alias "runtime/webui" -> "appWindow"
    if (strcmp(module_name, "runtime/webui") == 0 ||
        strcmp(module_name, "webUI") == 0 ||
        strcmp(module_name, "windowsAPI") == 0) {
        strncpy(module_name, "appWindow", sizeof(module_name) - 1);
    }
    // Handle alias "db" / "sqlite" / "sqlite3" / "mongoose" / "mongoose-sqlite" -> "database"
    if (strcmp(module_name, "db") == 0 ||
        strcmp(module_name, "sqlite") == 0 ||
        strcmp(module_name, "sqlite3") == 0 ||
        strcmp(module_name, "mongoose") == 0 ||
        strcmp(module_name, "mongoose-sqlite") == 0 ||
        strcmp(module_name, "mongoose_sqlite") == 0 ||
        strcmp(module_name, "mongooseSqlite") == 0) {
        strncpy(module_name, "database", sizeof(module_name) - 1);
    }
    // Handle alias "zip" -> "admZip"
    if (strcmp(module_name, "zip") == 0) {
        strncpy(module_name, "admZip", sizeof(module_name) - 1);
    }
    // Handle alias "https" -> "http"
    if (strcmp(module_name, "https") == 0) {
        strncpy(module_name, "http", sizeof(module_name) - 1);
    }
    // Handle alias "websocket" -> "ws"
    if (strcmp(module_name, "websocket") == 0) {
        strncpy(module_name, "ws", sizeof(module_name) - 1);
    }

    char* response_buffer = (char*)malloc(RITA_MAX_RESPONSE_LEN);
    if (!response_buffer) {
        webui_return_string(e, "{\"success\":false,\"error\":\"Memory allocation failure in dispatcher\"}");
        return;
    }
    response_buffer[0] = '\0';

    // Route to registered module
    bool found = false;
    for (size_t i = 0; i < s_registered_count; i++) {
        if (strcmp(s_registry[i].name, module_name) == 0) {
            s_registry[i].handler(e->window, action_name, raw_request, response_buffer, RITA_MAX_RESPONSE_LEN);
            found = true;
            break;
        }
    }

    if (!found) {
        snprintf(response_buffer, RITA_MAX_RESPONSE_LEN,
            "{\"id\":0,\"error\":{\"code\":\"E_DISABLED_MODULE\",\"message\":\"[RitaWapp Module] Module '%s' is disabled in RitaWapp.config.ts\"},\"success\":false}", module_name);
    }

    webui_return_string(e, response_buffer);
    free(response_buffer);
}

// ============================================================================
// JSON Parsing & String Utilities
// ============================================================================

bool json_extract_string(const char* json, const char* key, char* out_val, size_t max_len) {
    if (!json || !key || !out_val || max_len == 0) return false;
    char pattern[128];
    snprintf(pattern, sizeof(pattern), "\"%s\":", key);
    const char* pos = strstr(json, pattern);
    if (!pos) return false;

    pos += strlen(pattern);
    while (*pos == ' ' || *pos == '\t' || *pos == '\r' || *pos == '\n') pos++;

    if (*pos != '"') return false;
    pos++;

    size_t idx = 0;
    while (*pos != '\0' && *pos != '"' && idx + 1 < max_len) {
        if (*pos == '\\' && *(pos + 1) != '\0') {
            pos++;
            switch (*pos) {
                case 'n': out_val[idx++] = '\n'; break;
                case 'r': out_val[idx++] = '\r'; break;
                case 't': out_val[idx++] = '\t'; break;
                case '"': out_val[idx++] = '"'; break;
                case '\\': out_val[idx++] = '\\'; break;
                default: out_val[idx++] = *pos; break;
            }
        } else {
            out_val[idx++] = *pos;
        }
        pos++;
    }
    out_val[idx] = '\0';
    return true;
}

bool json_extract_arg(const char* json, size_t index, char* out_val, size_t max_len) {
    if (!json || !out_val || max_len == 0) return false;
    const char* pos = strstr(json, "\"args\":");
    if (!pos) return false;
    pos += 7;
    while (*pos == ' ' || *pos == '\t') pos++;
    if (*pos != '[') return false;
    pos++;

    size_t cur = 0;
    while (*pos != '\0' && *pos != ']') {
        while (*pos == ' ' || *pos == '\t' || *pos == ',') pos++;
        if (*pos == ']') break;

        if (cur == index) {
            if (*pos == '"') {
                pos++;
                size_t idx = 0;
                while (*pos != '\0' && *pos != '"' && idx + 1 < max_len) {
                    if (*pos == '\\' && *(pos + 1) != '\0') {
                        pos++;
                        switch (*pos) {
                            case 'n': out_val[idx++] = '\n'; break;
                            case 'r': out_val[idx++] = '\r'; break;
                            case 't': out_val[idx++] = '\t'; break;
                            case '"': out_val[idx++] = '"'; break;
                            case '\\': out_val[idx++] = '\\'; break;
                            default: out_val[idx++] = *pos; break;
                        }
                    } else {
                        out_val[idx++] = *pos;
                    }
                    pos++;
                }
                out_val[idx] = '\0';
                return true;
            } else if (*pos == '{' || *pos == '[') {
                char open_c = *pos;
                char close_c = (open_c == '{') ? '}' : ']';
                int depth = 0;
                size_t idx = 0;
                while (*pos != '\0' && idx + 1 < max_len) {
                    if (*pos == open_c) depth++;
                    else if (*pos == close_c) {
                        depth--;
                        if (depth == 0) {
                            out_val[idx++] = *pos++;
                            break;
                        }
                    }
                    out_val[idx++] = *pos++;
                }
                out_val[idx] = '\0';
                return true;
            } else {
                size_t idx = 0;
                while (*pos != '\0' && *pos != ',' && *pos != ']' && idx + 1 < max_len) {
                    out_val[idx++] = *pos++;
                }
                out_val[idx] = '\0';
                return true;
            }
        }

        // Skip to next argument
        if (*pos == '"') {
            pos++;
            while (*pos != '\0' && *pos != '"') {
                if (*pos == '\\' && *(pos + 1) != '\0') pos++;
                pos++;
            }
            if (*pos == '"') pos++;
        } else if (*pos == '{' || *pos == '[') {
            char open_c = *pos;
            char close_c = (open_c == '{') ? '}' : ']';
            int depth = 0;
            while (*pos != '\0') {
                if (*pos == open_c) depth++;
                else if (*pos == close_c) {
                    depth--;
                    if (depth == 0) { pos++; break; }
                }
                pos++;
            }
        } else {
            while (*pos != '\0' && *pos != ',' && *pos != ']') pos++;
        }
        cur++;
    }
    return false;
}

void escape_json_string(const char* input, char* output, size_t max_out) {
    if (!input || !output || max_out == 0) return;
    size_t out_idx = 0;
    for (size_t i = 0; input[i] != '\0' && out_idx + 6 < max_out; i++) {
        unsigned char c = (unsigned char)input[i];
        switch (c) {
            case '"':  output[out_idx++] = '\\'; output[out_idx++] = '"'; break;
            case '\\': output[out_idx++] = '\\'; output[out_idx++] = '\\'; break;
            case '\b': output[out_idx++] = '\\'; output[out_idx++] = 'b'; break;
            case '\f': output[out_idx++] = '\\'; output[out_idx++] = 'f'; break;
            case '\n': output[out_idx++] = '\\'; output[out_idx++] = 'n'; break;
            case '\r': output[out_idx++] = '\\'; output[out_idx++] = 'r'; break;
            case '\t': output[out_idx++] = '\\'; output[out_idx++] = 't'; break;
            default:
                if (c < 32) {
                    out_idx += snprintf(&output[out_idx], max_out - out_idx, "\\u%04x", c);
                } else {
                    output[out_idx++] = c;
                }
                break;
        }
    }
    output[out_idx] = '\0';
}
