/**
 * ============================================================================
 * RDevCore/modules/integrated/fs/fs_module.c
 * ============================================================================
 * Node.js-compatible File System Native C Implementation
 * ============================================================================
 */

#include "fs_module.h"
#include "ritawapp_modules.h"
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static bool utf8_to_wide(const char* utf8, wchar_t* wide, int max_wide) {
    if (!utf8 || !wide || max_wide <= 0) return false;
    int len = MultiByteToWideChar(CP_UTF8, 0, utf8, -1, wide, max_wide);
    if (len <= 0) {
        wide[0] = L'\0';
        return false;
    }
    return true;
}

static bool wide_to_utf8(const wchar_t* wide, char* utf8, int max_utf8) {
    if (!wide || !utf8 || max_utf8 <= 0) return false;
    int len = WideCharToMultiByte(CP_UTF8, 0, wide, -1, utf8, max_utf8, NULL, NULL);
    if (len <= 0) {
        utf8[0] = '\0';
        return false;
    }
    return true;
}

void register_fs_module(void) {
    ritawapp_register_module("fs", handle_fs_action);
}

void handle_fs_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp) {
    RW_UNUSED(window);
    if (strcmp(action, "readFile") == 0) {
        char file_path[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, file_path, sizeof(file_path));

        wchar_t wpath[MAX_PATH] = {0};
        utf8_to_wide(file_path, wpath, MAX_PATH);

        FILE* fp = _wfopen(wpath, L"rb");
        if (!fp) {
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"ENOENT: no such file or directory, open '%s'\"}", file_path);
            return;
        }

        fseek(fp, 0, SEEK_END);
        long sz = ftell(fp);
        fseek(fp, 0, SEEK_SET);

        char* buf = (char*)malloc(sz + 1);
        if (!buf) {
            fclose(fp);
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Out of memory\"}");
            return;
        }

        fread(buf, 1, sz, fp);
        buf[sz] = '\0';
        fclose(fp);

        char* escaped = (char*)malloc(sz * 2 + 64);
        if (escaped) {
            escape_json_string(buf, escaped, sz * 2 + 64);
            snprintf(response, max_resp, "{\"success\":true,\"data\":\"%s\"}", escaped);
            free(escaped);
        } else {
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Out of memory escaping JSON\"}");
        }
        free(buf);
    } else if (strcmp(action, "writeFile") == 0) {
        char file_path[MAX_PATH] = {0};
        char content[65536] = {0};
        json_extract_arg(json_request, 0, file_path, sizeof(file_path));
        json_extract_arg(json_request, 1, content, sizeof(content));

        wchar_t wpath[MAX_PATH] = {0};
        utf8_to_wide(file_path, wpath, MAX_PATH);

        FILE* fp = _wfopen(wpath, L"wb");
        if (!fp) {
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Cannot open file for writing: '%s'\"}", file_path);
            return;
        }
        size_t written = fwrite(content, 1, strlen(content), fp);
        fclose(fp);
        snprintf(response, max_resp, "{\"success\":true,\"data\":{\"bytesWritten\":%u}}", (unsigned int)written);
    } else if (strcmp(action, "appendFile") == 0) {
        char file_path[MAX_PATH] = {0};
        char content[65536] = {0};
        json_extract_arg(json_request, 0, file_path, sizeof(file_path));
        json_extract_arg(json_request, 1, content, sizeof(content));

        wchar_t wpath[MAX_PATH] = {0};
        utf8_to_wide(file_path, wpath, MAX_PATH);

        FILE* fp = _wfopen(wpath, L"ab");
        if (!fp) {
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Cannot open file for appending: '%s'\"}", file_path);
            return;
        }
        fwrite(content, 1, strlen(content), fp);
        fclose(fp);
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "unlink") == 0 || strcmp(action, "rm") == 0) {
        char file_path[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, file_path, sizeof(file_path));

        wchar_t wpath[MAX_PATH] = {0};
        utf8_to_wide(file_path, wpath, MAX_PATH);

        BOOL ok = DeleteFileW(wpath);
        if (!ok) ok = RemoveDirectoryW(wpath);
        snprintf(response, max_resp, "{\"success\":%s}", ok ? "true" : "false");
    } else if (strcmp(action, "mkdir") == 0) {
        char dir_path[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, dir_path, sizeof(dir_path));

        wchar_t wpath[MAX_PATH] = {0};
        utf8_to_wide(dir_path, wpath, MAX_PATH);

        BOOL ok = CreateDirectoryW(wpath, NULL);
        snprintf(response, max_resp, "{\"success\":%s}", (ok || GetLastError() == ERROR_ALREADY_EXISTS) ? "true" : "false");
    } else if (strcmp(action, "readdir") == 0) {
        char dir_path[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, dir_path, sizeof(dir_path));

        wchar_t wsearch[MAX_PATH + 16] = {0};
        wchar_t wdir[MAX_PATH] = {0};
        utf8_to_wide(dir_path, wdir, MAX_PATH);
        _snwprintf(wsearch, (sizeof(wsearch)/sizeof(wchar_t)) - 1, L"%ls\\*", wdir);

        WIN32_FIND_DATAW fd;
        HANDLE hFind = FindFirstFileW(wsearch, &fd);
        if (hFind == INVALID_HANDLE_VALUE) {
            snprintf(response, max_resp, "{\"success\":true,\"data\":[]}");
            return;
        }

        size_t off = snprintf(response, max_resp, "{\"success\":true,\"data\":[");
        bool first = true;
        do {
            if (wcscmp(fd.cFileName, L".") == 0 || wcscmp(fd.cFileName, L"..") == 0) continue;
            char utf8_name[MAX_PATH * 3] = {0};
            wide_to_utf8(fd.cFileName, utf8_name, sizeof(utf8_name));
            if (!first && off < max_resp - 2) off += snprintf(response + off, max_resp - off, ",");
            off += snprintf(response + off, max_resp - off, "\"%s\"", utf8_name);
            first = false;
        } while (FindNextFileW(hFind, &fd) && off < max_resp - 128);
        FindClose(hFind);

        snprintf(response + off, max_resp - off, "]}");
    } else if (strcmp(action, "stat") == 0) {
        char file_path[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, file_path, sizeof(file_path));

        wchar_t wpath[MAX_PATH] = {0};
        utf8_to_wide(file_path, wpath, MAX_PATH);

        WIN32_FILE_ATTRIBUTE_DATA fad;
        if (!GetFileAttributesExW(wpath, GetFileExInfoStandard, &fad)) {
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"ENOENT: no such file or directory, stat '%s'\"}", file_path);
            return;
        }
        ULARGE_INTEGER sz;
        sz.LowPart = fad.nFileSizeLow;
        sz.HighPart = fad.nFileSizeHigh;
        bool is_dir = (fad.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0;

        ULARGE_INTEGER ft;
        ft.LowPart = fad.ftLastWriteTime.dwLowDateTime;
        ft.HighPart = fad.ftLastWriteTime.dwHighDateTime;
        unsigned long long mtime_ms = (ft.QuadPart > 116444736000000000ULL) 
            ? (ft.QuadPart - 116444736000000000ULL) / 10000ULL : 0;

        snprintf(response, max_resp, "{\"success\":true,\"data\":{\"size\":%llu,\"isDirectory\":%s,\"isFile\":%s,\"mtime\":%llu}}",
            sz.QuadPart, is_dir ? "true" : "false", !is_dir ? "true" : "false", mtime_ms);
    } else if (strcmp(action, "exists") == 0) {
        char file_path[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, file_path, sizeof(file_path));

        wchar_t wpath[MAX_PATH] = {0};
        utf8_to_wide(file_path, wpath, MAX_PATH);

        DWORD attr = GetFileAttributesW(wpath);
        snprintf(response, max_resp, "{\"success\":true,\"data\":%s}", (attr != INVALID_FILE_ATTRIBUTES) ? "true" : "false");
    } else if (strcmp(action, "copyFile") == 0) {
        char src[MAX_PATH] = {0}, dest[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, src, sizeof(src));
        json_extract_arg(json_request, 1, dest, sizeof(dest));

        wchar_t wsrc[MAX_PATH] = {0}, wdest[MAX_PATH] = {0};
        utf8_to_wide(src, wsrc, MAX_PATH);
        utf8_to_wide(dest, wdest, MAX_PATH);

        BOOL ok = CopyFileW(wsrc, wdest, FALSE);
        snprintf(response, max_resp, "{\"success\":%s}", ok ? "true" : "false");
    } else if (strcmp(action, "rename") == 0) {
        char old_p[MAX_PATH] = {0}, new_p[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, old_p, sizeof(old_p));
        json_extract_arg(json_request, 1, new_p, sizeof(new_p));

        wchar_t wold[MAX_PATH] = {0}, wnew[MAX_PATH] = {0};
        utf8_to_wide(old_p, wold, MAX_PATH);
        utf8_to_wide(new_p, wnew, MAX_PATH);

        BOOL ok = MoveFileExW(wold, wnew, MOVEFILE_REPLACE_EXISTING);
        snprintf(response, max_resp, "{\"success\":%s}", ok ? "true" : "false");
    } else if (strcmp(action, "getAppDir") == 0) {
        wchar_t wexe_dir[MAX_PATH] = {0};
        GetModuleFileNameW(NULL, wexe_dir, MAX_PATH);
        wchar_t* last = wcsrchr(wexe_dir, L'\\');
        if (last) *last = L'\0';

        char exe_dir[MAX_PATH * 3] = {0};
        wide_to_utf8(wexe_dir, exe_dir, sizeof(exe_dir));

        char escaped[MAX_PATH * 6] = {0};
        escape_json_string(exe_dir, escaped, sizeof(escaped));
        snprintf(response, max_resp, "{\"success\":true,\"data\":\"%s\"}", escaped);
    } else {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Unknown fs action: '%s'\"}", action);
    }
}
