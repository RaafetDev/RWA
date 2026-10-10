/**
 * ============================================================================
 * RDevCore/modules/integrated/appWindow/app_window_module.c
 * ============================================================================
 * Native Desktop Window Management Module
 * ============================================================================
 */

#include <winsock2.h>
#include <windows.h>
#include "app_window_module.h"
#include "app_credentials.h"
#include "ritawapp_modules.h"
#include "../../../runtime/webui/include/webui.h"
#if defined(RITA_MODULE_TRAY_ENABLE) && RITA_MODULE_TRAY_ENABLE
#include "../tray/tray_module.h"
#endif
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#if defined(RITA_MODULE_NET_ENABLE) && RITA_MODULE_NET_ENABLE
void cleanup_net_module(void);
#endif
#if defined(RITA_MODULE_DGRAM_ENABLE) && RITA_MODULE_DGRAM_ENABLE
void cleanup_dgram_module(void);
#endif

void register_app_window_module(void) {
    ritawapp_register_module("appWindow", handle_app_window_action);
}

void handle_app_window_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp) {
    if (strcmp(action, "isFrameless") == 0) {
        bool frameless = ritawapp_get_frameless_state();
        snprintf(response, max_resp, "{\"success\":true,\"data\":%s}", frameless ? "true" : "false");

    } else if (strcmp(action, "minimize") == 0 || strcmp(action, "minimaze") == 0) {
        HWND hwnd = (HWND)ritawapp_get_window_hwnd(window);
        if (hwnd) {
#if defined(RITA_MODULE_TRAY_ENABLE) && RITA_MODULE_TRAY_ENABLE
            if (ritawapp_tray_is_hide_to_tray_enabled()) {
                ShowWindow(hwnd, SW_HIDE);
            } else {
                ShowWindow(hwnd, SW_MINIMIZE);
            }
#else
            ShowWindow(hwnd, SW_MINIMIZE);
#endif
        }
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "maximize") == 0) {
        HWND hwnd = (HWND)ritawapp_get_window_hwnd(window);
        if (hwnd) {
            if (IsZoomed(hwnd)) {
                ShowWindow(hwnd, SW_RESTORE);
            } else {
                ShowWindow(hwnd, SW_MAXIMIZE);
            }
        }
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "unmaximize") == 0 || strcmp(action, "restore") == 0) {
        HWND hwnd = (HWND)ritawapp_get_window_hwnd(window);
        if (hwnd) {
            ShowWindow(hwnd, SW_RESTORE);
        }
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "isMaximized") == 0) {
        HWND hwnd = (HWND)ritawapp_get_window_hwnd(window);
        bool zoomed = hwnd ? (IsZoomed(hwnd) != 0) : false;
        snprintf(response, max_resp, "{\"success\":true,\"data\":%s}", zoomed ? "true" : "false");
    } else if (strcmp(action, "close") == 0) {
        snprintf(response, max_resp, "{\"success\":true}");
        ritawapp_request_graceful_exit(window);
    } else if (strcmp(action, "drag") == 0 || strcmp(action, "dragWindow") == 0) {
        HWND hwnd = (HWND)ritawapp_get_window_hwnd(window);
        if (hwnd) {
            ReleaseCapture();
            SendMessage(hwnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
        }
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "setIcon") == 0) {
        char icon_path[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, icon_path, sizeof(icon_path));
        HWND hwnd = (HWND)ritawapp_get_window_hwnd(window);
        if (hwnd && strlen(icon_path) > 0) {
            HICON hIcon = (HICON)LoadImageA(NULL, icon_path, IMAGE_ICON, 0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE);
            if (hIcon) {
                SendMessage(hwnd, WM_SETICON, ICON_BIG, (LPARAM)hIcon);
                SendMessage(hwnd, WM_SETICON, ICON_SMALL, (LPARAM)hIcon);
            }
        }
        if (strlen(icon_path) > 0) {
            webui_set_icon_file(window, icon_path);
        }
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "hide") == 0) {
        webui_set_hide(window, true);
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "show") == 0) {
        webui_set_hide(window, false);
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "setSize") == 0) {
        char w_str[32] = {0}, h_str[32] = {0};
        json_extract_arg(json_request, 0, w_str, sizeof(w_str));
        json_extract_arg(json_request, 1, h_str, sizeof(h_str));
        unsigned int w = (unsigned int)atoi(w_str);
        unsigned int h = (unsigned int)atoi(h_str);
        if (w > 0 && h > 0) webui_set_size(window, w, h);
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "setPosition") == 0) {
        char x_str[32] = {0}, y_str[32] = {0};
        json_extract_arg(json_request, 0, x_str, sizeof(x_str));
        json_extract_arg(json_request, 1, y_str, sizeof(y_str));
        unsigned int x = (unsigned int)atoi(x_str);
        unsigned int y = (unsigned int)atoi(y_str);
        webui_set_position(window, x, y);
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "center") == 0) {
        webui_set_center(window);
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "setFrameless") == 0) {
        char flag_str[16] = {0};
        json_extract_arg(json_request, 0, flag_str, sizeof(flag_str));
        bool f = (strcmp(flag_str, "true") == 0 || strcmp(flag_str, "1") == 0);
        webui_set_frameless(window, f);
        ritawapp_set_frameless_state(f);
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "setTransparent") == 0) {
        char flag_str[16] = {0};
        json_extract_arg(json_request, 0, flag_str, sizeof(flag_str));
        bool t = (strcmp(flag_str, "true") == 0 || strcmp(flag_str, "1") == 0);
        webui_set_transparent(window, t);
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "setAlwaysOnTop") == 0) {
        // Native HWND always-on-top
        HWND hwnd = (HWND)webui_win32_get_hwnd(window);
        if (!hwnd) hwnd = (HWND)webui_get_hwnd(window);
        if (hwnd) {
            char flag_str[16] = {0};
            json_extract_arg(json_request, 0, flag_str, sizeof(flag_str));
            bool on_top = (strcmp(flag_str, "true") == 0 || strcmp(flag_str, "1") == 0);
            SetWindowPos(hwnd, on_top ? HWND_TOPMOST : HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
        }
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "navigate") == 0) {
        char url[1024] = {0};
        json_extract_arg(json_request, 0, url, sizeof(url));
        webui_navigate(window, url);
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "getUrl") == 0) {
        const char* url = webui_get_url(window);
        snprintf(response, max_resp, "{\"success\":true,\"data\":\"%s\"}", url ? url : "");
    } else if (strcmp(action, "reload") == 0) {
        webui_run(window, "window.location.reload();");
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "showMessageBox") == 0) {
        char title[256] = {0};
        char msg[1024] = {0};
        json_extract_arg(json_request, 0, title, sizeof(title));
        json_extract_arg(json_request, 1, msg, sizeof(msg));
        HWND hwnd = (HWND)webui_win32_get_hwnd(window);
        int res = MessageBoxA(hwnd, msg, title, MB_OK | MB_ICONINFORMATION);
        snprintf(response, max_resp, "{\"success\":true,\"data\":%d}", res);
    } else if (strcmp(action, "openDevTools") == 0) {
        HWND hwnd = (HWND)ritawapp_get_window_hwnd(window);
        if (!hwnd) hwnd = (HWND)webui_win32_get_hwnd(window);
        if (hwnd) {
            PostMessage(hwnd, WM_KEYDOWN, VK_F12, 0);
            PostMessage(hwnd, WM_KEYUP, VK_F12, 0);
            HWND child = (HWND)webui_win32_get_hwnd(window);
            if (child && child != hwnd) {
                PostMessage(child, WM_KEYDOWN, VK_F12, 0);
                PostMessage(child, WM_KEYUP, VK_F12, 0);
            }
        }
        snprintf(response, max_resp, "{\"success\":true}");
    } else {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Unknown appWindow action: '%s'\"}", action);
    }
}

