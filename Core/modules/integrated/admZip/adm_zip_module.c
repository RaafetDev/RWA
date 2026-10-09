/**
 * ============================================================================
 * RDevCore/modules/integrated/admZip/adm_zip_module.c
 * ============================================================================
 * Node.js-compatible 'adm-zip' Archive Management Module Implementation
 * Native ZIP parsing, inspection, extraction, and compression for Windows
 * ============================================================================
 */

#include "adm_zip_module.h"
#include "ritawapp_modules.h"
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

#pragma pack(push, 1)

// ZIP End of Central Directory Record
typedef struct {
    uint32_t signature;           // 0x06054b50
    uint16_t disk_number;
    uint16_t start_disk;
    uint16_t total_entries_disk;
    uint16_t total_entries;
    uint32_t cd_size;
    uint32_t cd_offset;
    uint16_t comment_length;
} ZipEOCD;

// ZIP Central Directory File Header
typedef struct {
    uint32_t signature;           // 0x02014b50
    uint16_t version_made_by;
    uint16_t version_needed;
    uint16_t flags;
    uint16_t compression_method;
    uint16_t last_mod_time;
    uint16_t last_mod_date;
    uint32_t crc32;
    uint32_t compressed_size;
    uint32_t uncompressed_size;
    uint16_t file_name_length;
    uint16_t extra_field_length;
    uint16_t file_comment_length;
    uint16_t disk_number_start;
    uint16_t internal_file_attributes;
    uint32_t external_file_attributes;
    uint32_t local_header_offset;
} ZipCDFileHeader;

#pragma pack(pop)

static bool run_silent_command(const char* cmd) {
    STARTUPINFOA si;
    PROCESS_INFORMATION pi;
    memset(&si, 0, sizeof(si));
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    memset(&pi, 0, sizeof(pi));

    char cmd_buf[4096];
    strncpy(cmd_buf, cmd, sizeof(cmd_buf) - 1);
    cmd_buf[sizeof(cmd_buf) - 1] = '\0';

    if (!CreateProcessA(NULL, cmd_buf, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        return false;
    }

    WaitForSingleObject(pi.hProcess, 30000);
    DWORD exit_code = 1;
    GetExitCodeProcess(pi.hProcess, &exit_code);
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    return (exit_code == 0);
}

void register_adm_zip_module(void) {
    ritawapp_register_module("admZip", handle_adm_zip_action);
}

void handle_adm_zip_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp) {
    (void)window;

    if (strcmp(action, "getEntries") == 0) {
        char zip_path[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, zip_path, sizeof(zip_path));

        FILE* fp = fopen(zip_path, "rb");
        if (!fp) {
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Cannot open ZIP file: '%s'\"}", zip_path);
            return;
        }

        fseek(fp, 0, SEEK_END);
        long file_size = ftell(fp);
        if (file_size < (long)sizeof(ZipEOCD)) {
            fclose(fp);
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Invalid or corrupted ZIP file\"}");
            return;
        }

        // Search backward for EOCD signature (0x06054b50)
        long search_len = file_size > 65557 ? 65557 : file_size;
        fseek(fp, file_size - search_len, SEEK_SET);

        char* search_buf = (char*)malloc(search_len);
        if (!search_buf) {
            fclose(fp);
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Out of memory\"}");
            return;
        }

        size_t bytes_read = fread(search_buf, 1, search_len, fp);
        long eocd_pos = -1;
        for (long i = (long)bytes_read - 4; i >= 0; i--) {
            if (*(uint32_t*)(search_buf + i) == 0x06054b50) {
                eocd_pos = file_size - search_len + i;
                break;
            }
        }
        free(search_buf);

        if (eocd_pos < 0) {
            fclose(fp);
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"ZIP End of Central Directory not found\"}");
            return;
        }

        fseek(fp, eocd_pos, SEEK_SET);
        ZipEOCD eocd;
        if (fread(&eocd, 1, sizeof(eocd), fp) != sizeof(eocd)) {
            fclose(fp);
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Failed to read ZIP EOCD header\"}");
            return;
        }

        // Read Central Directory
        fseek(fp, eocd.cd_offset, SEEK_SET);

        size_t written = 0;
        written += snprintf(response + written, max_resp - written, "{\"success\":true,\"data\":{\"count\":%u,\"entries\":[", eocd.total_entries);

        for (uint16_t i = 0; i < eocd.total_entries; i++) {
            ZipCDFileHeader cd;
            if (fread(&cd, 1, sizeof(cd), fp) != sizeof(cd) || cd.signature != 0x02014b50) {
                break;
            }

            char filename[MAX_PATH] = {0};
            uint16_t name_len = cd.file_name_length < MAX_PATH ? cd.file_name_length : MAX_PATH - 1;
            if (fread(filename, 1, name_len, fp) != name_len) break;
            filename[name_len] = '\0';

            // Skip extra field and file comment
            fseek(fp, cd.extra_field_length + cd.file_comment_length, SEEK_CUR);

            bool is_dir = (filename[name_len - 1] == '/' || filename[name_len - 1] == '\\');

            if (i > 0 && written < max_resp - 2) {
                response[written++] = ',';
            }

            written += snprintf(response + written, max_resp - written,
                "{\"entryName\":\"%s\",\"size\":%lu,\"compressedSize\":%lu,\"isDirectory\":%s}",
                filename, (unsigned long)cd.uncompressed_size, (unsigned long)cd.compressed_size, is_dir ? "true" : "false");

            if (written >= max_resp - 100) break;
        }

        fclose(fp);
        snprintf(response + written, max_resp - written, "]}}");

    } else if (strcmp(action, "extractAllTo") == 0) {
        char zip_path[MAX_PATH] = {0};
        char dest_dir[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, zip_path, sizeof(zip_path));
        json_extract_arg(json_request, 1, dest_dir, sizeof(dest_dir));

        if (!zip_path[0] || !dest_dir[0]) {
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Missing archive or destination path\"}");
            return;
        }

        // Ensure target directory exists
        CreateDirectoryA(dest_dir, NULL);

        // Windows 10/11 built-in tar command extracts standard ZIP archives
        char cmd[2048];
        snprintf(cmd, sizeof(cmd), "tar.exe -xf \"%s\" -C \"%s\"", zip_path, dest_dir);
        bool ok = run_silent_command(cmd);

        if (!ok) {
            // Fallback to PowerShell Expand-Archive
            snprintf(cmd, sizeof(cmd), "powershell -NoProfile -NonInteractive -Command \"Expand-Archive -Force -Path '%s' -DestinationPath '%s'\"", zip_path, dest_dir);
            ok = run_silent_command(cmd);
        }

        snprintf(response, max_resp, "{\"success\":%s}", ok ? "true" : "false");

    } else if (strcmp(action, "createZip") == 0 || strcmp(action, "writeZip") == 0) {
        char zip_path[MAX_PATH] = {0};
        char source_path[MAX_PATH] = {0};
        json_extract_arg(json_request, 0, zip_path, sizeof(zip_path));
        json_extract_arg(json_request, 1, source_path, sizeof(source_path));

        if (!zip_path[0] || !source_path[0]) {
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Missing zipPath or sourcePath\"}");
            return;
        }

        char cmd[2048];
        snprintf(cmd, sizeof(cmd), "tar.exe -a -cf \"%s\" \"%s\"", zip_path, source_path);
        bool ok = run_silent_command(cmd);

        if (!ok) {
            snprintf(cmd, sizeof(cmd), "powershell -NoProfile -NonInteractive -Command \"Compress-Archive -Force -Path '%s' -DestinationPath '%s'\"", source_path, zip_path);
            ok = run_silent_command(cmd);
        }

        snprintf(response, max_resp, "{\"success\":%s}", ok ? "true" : "false");

    } else {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Unknown admZip action: '%s'\"}", action);
    }
}
