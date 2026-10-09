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

void register_fs_module(void) {
    ritawapp_register_module("fs", handle_fs_action);
}

void handle_fs_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp) {
    RW_UNUSED(window);
    if (strcmp(action, "readFile") == 0) {
        char file_path[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, file_path, sizeof(file_path));

        FILE* fp = fopen(file_path, "rb");
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

        FILE* fp = fopen(file_path, "wb");
        if (!fp) {
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Cannot open file for writing\"}");
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

        FILE* fp = fopen(file_path, "ab");
        if (!fp) {
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Cannot open file for appending\"}");
            return;
        }
        fwrite(content, 1, strlen(content), fp);
        fclose(fp);
        snprintf(response, max_resp, "{\"success\":true}");
    } else if (strcmp(action, "unlink") == 0 || strcmp(action, "rm") == 0) {
        char file_path[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, file_path, sizeof(file_path));
        BOOL ok = DeleteFileA(file_path);
        if (!ok) ok = RemoveDirectoryA(file_path);
        snprintf(response, max_resp, "{\"success\":%s}", ok ? "true" : "false");
    } else if (strcmp(action, "mkdir") == 0) {
        char dir_path[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, dir_path, sizeof(dir_path));
        BOOL ok = CreateDirectoryA(dir_path, NULL);
        snprintf(response, max_resp, "{\"success\":%s}", (ok || GetLastError() == ERROR_ALREADY_EXISTS) ? "true" : "false");
    } else if (strcmp(action, "readdir") == 0) {
        char dir_path[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, dir_path, sizeof(dir_path));
        char search_path[MAX_PATH + 16];
        snprintf(search_path, sizeof(search_path), "%s\\*", dir_path);

        WIN32_FIND_DATAA fd;
        HANDLE hFind = FindFirstFileA(search_path, &fd);
        if (hFind == INVALID_HANDLE_VALUE) {
            snprintf(response, max_resp, "{\"success\":true,\"data\":[]}");
            return;
        }

        size_t off = snprintf(response, max_resp, "{\"success\":true,\"data\":[");
        bool first = true;
        do {
            if (strcmp(fd.cFileName, ".") == 0 || strcmp(fd.cFileName, "..") == 0) continue;
            if (!first && off < max_resp - 2) off += snprintf(response + off, max_resp - off, ",");
            off += snprintf(response + off, max_resp - off, "\"%s\"", fd.cFileName);
            first = false;
        } while (FindNextFileA(hFind, &fd) && off < max_resp - 128);
        FindClose(hFind);

        snprintf(response + off, max_resp - off, "]}");
    } else if (strcmp(action, "stat") == 0) {
        char file_path[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, file_path, sizeof(file_path));
        WIN32_FILE_ATTRIBUTE_DATA fad;
        if (!GetFileAttributesExA(file_path, GetFileExInfoStandard, &fad)) {
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"ENOENT\"}");
            return;
        }
        ULARGE_INTEGER sz;
        sz.LowPart = fad.nFileSizeLow;
        sz.HighPart = fad.nFileSizeHigh;
        bool is_dir = (fad.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
        snprintf(response, max_resp, "{\"success\":true,\"data\":{\"size\":%llu,\"isDirectory\":%s,\"isFile\":%s}}",
            sz.QuadPart, is_dir ? "true" : "false", !is_dir ? "true" : "false");
    } else if (strcmp(action, "exists") == 0) {
        char file_path[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, file_path, sizeof(file_path));
        DWORD attr = GetFileAttributesA(file_path);
        snprintf(response, max_resp, "{\"success\":true,\"data\":%s}", (attr != INVALID_FILE_ATTRIBUTES) ? "true" : "false");
    } else if (strcmp(action, "copyFile") == 0) {
        char src[MAX_PATH] = {0}, dest[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, src, sizeof(src));
        json_extract_arg(json_request, 1, dest, sizeof(dest));
        BOOL ok = CopyFileA(src, dest, FALSE);
        snprintf(response, max_resp, "{\"success\":%s}", ok ? "true" : "false");
    } else if (strcmp(action, "rename") == 0) {
        char old_p[MAX_PATH] = {0}, new_p[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, old_p, sizeof(old_p));
        json_extract_arg(json_request, 1, new_p, sizeof(new_p));
        BOOL ok = MoveFileExA(old_p, new_p, MOVEFILE_REPLACE_EXISTING);
        snprintf(response, max_resp, "{\"success\":%s}", ok ? "true" : "false");
    } else if (strcmp(action, "getAppDir") == 0) {
        char exe_dir[MAX_PATH] = {0};
        GetModuleFileNameA(NULL, exe_dir, MAX_PATH);
        char* last = strrchr(exe_dir, '\\');
        if (last) *last = '\0';
        char escaped[MAX_PATH * 2] = {0};
        escape_json_string(exe_dir, escaped, sizeof(escaped));
        snprintf(response, max_resp, "{\"success\":true,\"data\":\"%s\"}", escaped);
    } else {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Unknown fs action: '%s'\"}", action);
    }
}
