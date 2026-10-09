/**
 * ============================================================================
 * RDevCore/modules/integrated/tray/tray_module.c
 * ============================================================================
 * Native Windows System Tray Module Implementation
 *
 * Implements a dedicated Win32 message pump thread with top-level WS_POPUP window
 * ensuring Shell_NotifyIconA events (left-click, right-click, context menu)
 * and TrackPopupMenu render instantly without blocking the WebUI event loop.
 * ============================================================================
 */

#include "tray_module.h"
#include "ritawapp_modules.h"
#include "../../../runtime/webui/include/webui.h"
#include <windows.h>
#include <shellapi.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WM_TRAY_NOTIFY      (WM_USER + 300)
#define WM_TRAY_UPDATE_TIP  (WM_USER + 301)
#define WM_TRAY_UPDATE_ICON (WM_USER + 302)
#define TRAY_MAX_ITEMS      32

typedef struct {
    int id;
    char name[128];
    char action[128];
    bool is_separator;
    bool is_disabled;
    bool is_checked;
} TrayMenuItem;

static HWND s_hwnd_tray = NULL;
static NOTIFYICONDATAA s_nid;
static bool s_tray_initialized = false;
static bool s_hide_to_tray = false;
static size_t s_tray_window = 0;
static TrayMenuItem s_tray_items[TRAY_MAX_ITEMS];
static size_t s_tray_item_count = 0;
static CRITICAL_SECTION s_tray_cs;
static bool s_tray_cs_init = false;
static HANDLE s_tray_thread = NULL;
static DWORD s_tray_thread_id = 0;
static HANDLE s_tray_ready_event = NULL;
static char s_saved_tooltip[128] = "RitaWapp Desktop";
static char s_saved_icon_path[MAX_PATH] = {0};

static void ritawapp_tray_execute_command(int cmd_id) {
    char act[128] = {0};

    EnterCriticalSection(&s_tray_cs);
    if (s_tray_item_count == 0) {
        LeaveCriticalSection(&s_tray_cs);
        if (cmd_id == 1) {
            ritawapp_tray_show_window(s_tray_window);
        } else if (cmd_id == 2) {
            ritawapp_tray_hide_window(s_tray_window);
        } else if (cmd_id == 3) {
            webui_exit();
        }
        return;
    }

    for (size_t i = 0; i < s_tray_item_count; i++) {
        if (s_tray_items[i].id == cmd_id) {
            strncpy(act, s_tray_items[i].action, sizeof(act) - 1);
            break;
        }
    }
    LeaveCriticalSection(&s_tray_cs);

    if (strcmp(act, "appShow") == 0 || strcmp(act, "show") == 0 || strcmp(act, "open") == 0) {
        ritawapp_tray_show_window(s_tray_window);
    } else if (strcmp(act, "appHide") == 0 || strcmp(act, "hide") == 0) {
        ritawapp_tray_hide_window(s_tray_window);
    } else if (strcmp(act, "toggle") == 0) {
        HWND hwnd = (HWND)ritawapp_get_window_hwnd(s_tray_window);
        if (hwnd) {
            if (IsWindowVisible(hwnd) && !IsIconic(hwnd)) {
                ritawapp_tray_hide_window(s_tray_window);
            } else {
                ritawapp_tray_show_window(s_tray_window);
            }
        }
    } else if (strcmp(act, "exit") == 0 || strcmp(act, "quit") == 0 || strcmp(act, "close") == 0) {
        webui_exit();
    } else if (strlen(act) > 0) {
        char js_code[512];
        snprintf(js_code, sizeof(js_code),
            "if (typeof window !== 'undefined' && window.__rita_tray_dispatch) { window.__rita_tray_dispatch('%s', %d); }",
            act, cmd_id);
        webui_run(s_tray_window, js_code);
    }
}

static LRESULT CALLBACK TrayWndProc(HWND hwnd, UINT uMsg, WPARAM wParam, LPARAM lParam) {
    (void)wParam;
    switch (uMsg) {
        case WM_TRAY_NOTIFY: {
            if (lParam == WM_RBUTTONUP || lParam == WM_CONTEXTMENU) {
                POINT pt;
                GetCursorPos(&pt);

                // SetForegroundWindow must be called so menu dismisses when clicking elsewhere
                SetForegroundWindow(hwnd);

                HMENU hMenu = CreatePopupMenu();
                EnterCriticalSection(&s_tray_cs);
                if (s_tray_item_count == 0) {
                    AppendMenuA(hMenu, MF_STRING, 1, "Show / Restore");
                    AppendMenuA(hMenu, MF_STRING, 2, "Hide to Tray");
                    AppendMenuA(hMenu, MF_SEPARATOR, 0, NULL);
                    AppendMenuA(hMenu, MF_STRING, 3, "Exit Application");
                } else {
                    for (size_t i = 0; i < s_tray_item_count; i++) {
                        if (s_tray_items[i].is_separator) {
                            AppendMenuA(hMenu, MF_SEPARATOR, 0, NULL);
                        } else {
                            UINT flags = MF_STRING;
                            if (s_tray_items[i].is_disabled) flags |= (MF_GRAYED | MF_DISABLED);
                            if (s_tray_items[i].is_checked) flags |= MF_CHECKED;
                            AppendMenuA(hMenu, flags, (UINT_PTR)s_tray_items[i].id, s_tray_items[i].name);
                        }
                    }
                }
                LeaveCriticalSection(&s_tray_cs);

                int cmd = TrackPopupMenu(hMenu, TPM_RETURNCMD | TPM_NONOTIFY | TPM_RIGHTBUTTON, pt.x, pt.y, 0, hwnd, NULL);
                PostMessageA(hwnd, WM_NULL, 0, 0);
                DestroyMenu(hMenu);

                if (cmd > 0) {
                    ritawapp_tray_execute_command(cmd);
                }
                return 0;
            } else if (lParam == WM_LBUTTONUP || lParam == WM_LBUTTONDBLCLK) {
                HWND hwndMain = (HWND)ritawapp_get_window_hwnd(s_tray_window);
                if (hwndMain) {
                    if (IsWindowVisible(hwndMain) && !IsIconic(hwndMain)) {
                        ritawapp_tray_hide_window(s_tray_window);
                    } else {
                        ritawapp_tray_show_window(s_tray_window);
                    }
                }
                return 0;
            }
            break;
        }
        case WM_TRAY_UPDATE_TIP: {
            EnterCriticalSection(&s_tray_cs);
            strncpy(s_nid.szTip, s_saved_tooltip, sizeof(s_nid.szTip) - 1);
            s_nid.szTip[sizeof(s_nid.szTip) - 1] = '\0';
            LeaveCriticalSection(&s_tray_cs);
            Shell_NotifyIconA(NIM_MODIFY, &s_nid);
            return 0;
        }
        case WM_TRAY_UPDATE_ICON: {
            HICON hNewIcon = (HICON)lParam;
            if (hNewIcon) {
                s_nid.hIcon = hNewIcon;
                Shell_NotifyIconA(NIM_MODIFY, &s_nid);
            }
            return 0;
        }
        case WM_DESTROY: {
            Shell_NotifyIconA(NIM_DELETE, &s_nid);
            PostQuitMessage(0);
            return 0;
        }
    }
    return DefWindowProcA(hwnd, uMsg, wParam, lParam);
}

static DWORD WINAPI TrayWorkerThread(LPVOID param) {
    (void)param;

    WNDCLASSA wc = {0};
    wc.lpfnWndProc = TrayWndProc;
    wc.hInstance = GetModuleHandleA(NULL);
    wc.lpszClassName = "RitaWappTrayWindowCls";

    RegisterClassA(&wc);

    // Create a real top-level popup window (hidden, NULL parent) so SetForegroundWindow works
    s_hwnd_tray = CreateWindowExA(
        WS_EX_TOOLWINDOW,
        "RitaWappTrayWindowCls",
        "RitaWapp Tray Context",
        WS_POPUP,
        0, 0, 0, 0,
        NULL,
        NULL,
        GetModuleHandleA(NULL),
        NULL
    );

    if (!s_hwnd_tray) {
        SetEvent(s_tray_ready_event);
        return 1;
    }

    HICON hIcon = NULL;
    // 1. Try loading from compiled PE resource ID 1
    hIcon = (HICON)LoadImageA(GetModuleHandleA(NULL), MAKEINTRESOURCEA(1), IMAGE_ICON,
        GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON), LR_DEFAULTCOLOR);

    // 2. Try loading from file path
    if (!hIcon && strlen(s_saved_icon_path) > 0) {
        hIcon = (HICON)LoadImageA(NULL, s_saved_icon_path, IMAGE_ICON,
            GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON), LR_LOADFROMFILE);
    }
    if (!hIcon) {
        hIcon = (HICON)LoadImageA(NULL, "app.ico", IMAGE_ICON,
            GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON), LR_LOADFROMFILE);
    }
    if (!hIcon) {
        hIcon = (HICON)LoadImageA(NULL, "RitaWapp-ui/public/app.ico", IMAGE_ICON,
            GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON), LR_LOADFROMFILE);
    }
    if (!hIcon) {
        hIcon = LoadIconA(NULL, IDI_APPLICATION);
    }

    memset(&s_nid, 0, sizeof(s_nid));
    s_nid.cbSize = sizeof(NOTIFYICONDATAA);
    s_nid.hWnd = s_hwnd_tray;
    s_nid.uID = 1001;
    s_nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
    s_nid.uCallbackMessage = WM_TRAY_NOTIFY;
    s_nid.hIcon = hIcon;
    strncpy(s_nid.szTip, s_saved_tooltip, sizeof(s_nid.szTip) - 1);

    BOOL ok = Shell_NotifyIconA(NIM_ADD, &s_nid);
    s_tray_initialized = (ok != FALSE);

    // Notify caller that tray is ready
    SetEvent(s_tray_ready_event);

    // Dedicated Win32 Message Loop for Tray Icon
    MSG msg;
    while (GetMessageA(&msg, NULL, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessageA(&msg);
    }

    Shell_NotifyIconA(NIM_DELETE, &s_nid);
    s_tray_initialized = false;
    return 0;
}

bool ritawapp_tray_init(size_t window, const char* tooltip, const char* icon_path) {
    s_tray_window = window;

    if (!s_tray_cs_init) {
        InitializeCriticalSection(&s_tray_cs);
        s_tray_cs_init = true;
    }

    EnterCriticalSection(&s_tray_cs);
    if (tooltip && strlen(tooltip) > 0) {
        strncpy(s_saved_tooltip, tooltip, sizeof(s_saved_tooltip) - 1);
    }
    if (icon_path && strlen(icon_path) > 0) {
        strncpy(s_saved_icon_path, icon_path, sizeof(s_saved_icon_path) - 1);
    }
    LeaveCriticalSection(&s_tray_cs);

    if (s_tray_initialized && s_hwnd_tray) {
        PostMessageA(s_hwnd_tray, WM_TRAY_UPDATE_TIP, 0, 0);
        return true;
    }

    if (!s_tray_ready_event) {
        s_tray_ready_event = CreateEventA(NULL, FALSE, FALSE, NULL);
    }

    if (!s_tray_thread) {
        s_tray_thread = CreateThread(NULL, 0, TrayWorkerThread, NULL, 0, &s_tray_thread_id);
        if (s_tray_thread) {
            WaitForSingleObject(s_tray_ready_event, 3000);
        }
    }

    return s_tray_initialized;
}

void ritawapp_tray_destroy(void) {
    if (s_hwnd_tray) {
        PostMessageA(s_hwnd_tray, WM_DESTROY, 0, 0);
    }
    if (s_tray_thread) {
        WaitForSingleObject(s_tray_thread, 2000);
        CloseHandle(s_tray_thread);
        s_tray_thread = NULL;
    }
    if (s_tray_ready_event) {
        CloseHandle(s_tray_ready_event);
        s_tray_ready_event = NULL;
    }
    s_tray_initialized = false;
    s_hwnd_tray = NULL;
}

bool ritawapp_tray_is_hide_to_tray_enabled(void) {
    return s_hide_to_tray;
}

void ritawapp_tray_set_hide_to_tray(bool enable) {
    s_hide_to_tray = enable;
}

void ritawapp_tray_show_window(size_t window) {
    HWND hwnd = (HWND)ritawapp_get_window_hwnd(window);
    if (!hwnd && s_tray_window) hwnd = (HWND)ritawapp_get_window_hwnd(s_tray_window);
    if (hwnd) {
        ShowWindow(hwnd, SW_SHOW);
        ShowWindow(hwnd, SW_RESTORE);
        SetForegroundWindow(hwnd);
        SetActiveWindow(hwnd);
    }
}

void ritawapp_tray_hide_window(size_t window) {
    HWND hwnd = (HWND)ritawapp_get_window_hwnd(window);
    if (!hwnd && s_tray_window) hwnd = (HWND)ritawapp_get_window_hwnd(s_tray_window);
    if (hwnd) {
        ShowWindow(hwnd, SW_HIDE);
    }
}

void register_tray_module(void) {
    ritawapp_register_module("tray", handle_tray_action);
}

void handle_tray_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp) {
    if (strcmp(action, "init") == 0) {
        char tooltip[128] = {0};
        char icon_path[MAX_PATH] = {0};
        json_extract_string(json_request, "tooltip", tooltip, sizeof(tooltip));
        json_extract_string(json_request, "icon", icon_path, sizeof(icon_path));
        bool ok = ritawapp_tray_init(window, tooltip[0] ? tooltip : NULL, icon_path[0] ? icon_path : NULL);
        snprintf(response, max_resp, "{\"success\":%s}", ok ? "true" : "false");
    } else if (strcmp(action, "destroy") == 0) {
        ritawapp_tray_destroy();
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "set") == 0) {
        char key[64] = {0};
        char opt_json[512] = {0};
        json_extract_arg(json_request, 0, key, sizeof(key));
        json_extract_arg(json_request, 1, opt_json, sizeof(opt_json));

        if (strcmp(key, "app:minimaze") == 0 || strcmp(key, "app:minimize") == 0) {
            bool hide = false;
            if (strstr(opt_json, "\"hideToTray\":true") || strstr(opt_json, "\"hideTotray\":true") ||
                strstr(opt_json, "\"hideToTray\": 1") || strstr(opt_json, "\"hideTotray\": 1")) {
                hide = true;
            }
            if (strstr(opt_json, "\"reset\":true") || strstr(opt_json, "\"reset\": 1") ||
                strstr(opt_json, "\"hideToTray\":false") || strstr(opt_json, "\"hideTotray\":false")) {
                hide = false;
            }
            ritawapp_tray_set_hide_to_tray(hide);

            if (hide && !s_tray_initialized) {
                ritawapp_tray_init(window, NULL, NULL);
            }

            snprintf(response, max_resp, "{\"success\":true,\"data\":{\"hideToTray\":%s}}", hide ? "true" : "false");
        } else if (strcmp(key, "tooltip") == 0) {
            char val[128] = {0};
            json_extract_string(opt_json, "text", val, sizeof(val));
            if (!val[0]) strncpy(val, opt_json, sizeof(val) - 1);
            if (strlen(val) > 0) {
                EnterCriticalSection(&s_tray_cs);
                strncpy(s_saved_tooltip, val, sizeof(s_saved_tooltip) - 1);
                LeaveCriticalSection(&s_tray_cs);
                if (s_hwnd_tray) PostMessageA(s_hwnd_tray, WM_TRAY_UPDATE_TIP, 0, 0);
            }
            snprintf(response, max_resp, "{\"success\":true}");
        } else {
            snprintf(response, max_resp, "{\"success\":true}");
        }
    } else if (strcmp(action, "appHide") == 0) {
        ritawapp_tray_hide_window(window);
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "appShow") == 0) {
        ritawapp_tray_show_window(window);
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "isHideToTray") == 0) {
        bool hide = ritawapp_tray_is_hide_to_tray_enabled();
        snprintf(response, max_resp, "{\"success\":true,\"data\":%s}", hide ? "true" : "false");
    } else if (strcmp(action, "setTooltip") == 0) {
        char tip[128] = {0};
        json_extract_arg(json_request, 0, tip, sizeof(tip));
        if (strlen(tip) > 0) {
            EnterCriticalSection(&s_tray_cs);
            strncpy(s_saved_tooltip, tip, sizeof(s_saved_tooltip) - 1);
            LeaveCriticalSection(&s_tray_cs);
            if (s_hwnd_tray) PostMessageA(s_hwnd_tray, WM_TRAY_UPDATE_TIP, 0, 0);
        }
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "items") == 0) {
        char items_json[8192] = {0};
        json_extract_arg(json_request, 0, items_json, sizeof(items_json));

        EnterCriticalSection(&s_tray_cs);
        s_tray_item_count = 0;

        const char* p = items_json;
        while (*p && *p != '[') p++;
        if (*p == '[') p++;

        int cur_id = 1;
        while (*p && *p != ']' && s_tray_item_count < TRAY_MAX_ITEMS) {
            while (*p && (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n' || *p == ',')) p++;
            if (*p == ']') break;
            if (*p == '{') {
                const char* obj_start = p;
                int depth = 0;
                while (*p) {
                    if (*p == '{') depth++;
                    else if (*p == '}') {
                        depth--;
                        if (depth == 0) { p++; break; }
                    }
                    p++;
                }
                size_t obj_len = (size_t)(p - obj_start);
                char obj[1024];
                if (obj_len < sizeof(obj)) {
                    memcpy(obj, obj_start, obj_len);
                    obj[obj_len] = '\0';

                    TrayMenuItem* item = &s_tray_items[s_tray_item_count];
                    item->id = cur_id++;
                    item->is_separator = false;
                    item->is_disabled = false;
                    item->is_checked = false;
                    item->name[0] = '\0';
                    item->action[0] = '\0';

                    if (strstr(obj, "\"type\":\"separator\"") || strstr(obj, "\"type\": \"separator\"") ||
                        strstr(obj, "\"separator\":true") || strstr(obj, "\"separator\": true") ||
                        strstr(obj, "\"is_separator\":true") || strstr(obj, "\"name\":\"-\"") || strstr(obj, "\"name\": \"-\"")) {
                        item->is_separator = true;
                    } else {
                        json_extract_string(obj, "name", item->name, sizeof(item->name));
                        if (!item->name[0]) {
                            json_extract_string(obj, "label", item->name, sizeof(item->name));
                        }
                        json_extract_string(obj, "action", item->action, sizeof(item->action));
                        if (!item->action[0]) {
                            strncpy(item->action, item->name, sizeof(item->action) - 1);
                        }
                        if (strstr(obj, "\"disabled\":true") || strstr(obj, "\"disabled\": true")) {
                            item->is_disabled = true;
                        }
                        if (strstr(obj, "\"checked\":true") || strstr(obj, "\"checked\": true")) {
                            item->is_checked = true;
                        }
                    }
                    s_tray_item_count++;
                }
            } else {
                p++;
            }
        }
        size_t count = s_tray_item_count;
        LeaveCriticalSection(&s_tray_cs);

        snprintf(response, max_resp, "{\"success\":true,\"data\":{\"count\":%zu}}", count);
    } else {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Unknown tray action: '%s'\"}", action);
    }
}
