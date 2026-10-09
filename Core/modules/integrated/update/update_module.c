/**
 * ============================================================================
 * RDevCore/modules/integrated/update/update_module.c
 * ============================================================================
 * Application Auto-Updater & GitHub Release Sync Native C Implementation
 * Uses WinINet & URLMon to check GitHub releases and download updates.
 * ============================================================================
 */

#include "update_module.h"
#include "ritawapp_modules.h"
#include "app_credentials.h"
#include <windows.h>
#include <wininet.h>
#include <urlmon.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/**
 * Extracts a JSON string field from a JSON payload.
 */
static bool parse_json_value(const char* json, const char* key, char* out, size_t max_out) {
    if (!json || !key || !out || max_out == 0) return false;
    out[0] = '\0';

    char search_pattern[128] = {0};
    snprintf(search_pattern, sizeof(search_pattern), "\"%s\":", key);

    const char* pos = strstr(json, search_pattern);
    if (!pos) return false;

    pos += strlen(search_pattern);
    while (*pos == ' ' || *pos == '\t' || *pos == '\r' || *pos == '\n') pos++;

    if (*pos == '"') {
        pos++;
        size_t idx = 0;
        while (*pos && *pos != '"' && idx < max_out - 1) {
            if (*pos == '\\' && *(pos + 1)) pos++;
            out[idx++] = *pos++;
        }
        out[idx] = '\0';
        return true;
    }
    return false;
}

/**
 * Checks GitHub latest release for updates via GitHub REST API over HTTPS.
 */
static bool check_github_releases(const char* repo_url, char* tag_out, size_t tag_max, char* notes_out, size_t notes_max, char* download_out, size_t dl_max) {
    if (!repo_url || strlen(repo_url) == 0) return false;

    // Parse owner/repo from URL (e.g. "https://github.com/owner/repo")
    const char* gh = strstr(repo_url, "github.com/");
    if (!gh) return false;
    const char* path = gh + strlen("github.com/");

    char owner_repo[256] = {0};
    strncpy(owner_repo, path, sizeof(owner_repo) - 1);
    char* slash = strchr(owner_repo, '/');
    if (!slash) return false;
    char* slash2 = strchr(slash + 1, '/');
    if (slash2) *slash2 = '\0';
    // Trim .git suffix
    char* dotgit = strstr(owner_repo, ".git");
    if (dotgit) *dotgit = '\0';

    char api_url[512] = {0};
    snprintf(api_url, sizeof(api_url), "https://api.github.com/repos/%s/releases/latest", owner_repo);

    HINTERNET hInternet = InternetOpenA("RitaWapp-Updater", INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
    if (!hInternet) return false;

    HINTERNET hUrl = InternetOpenUrlA(
        hInternet,
        api_url,
        "Accept: application/vnd.github.v3+json\r\nUser-Agent: RitaWapp-Updater\r\n",
        (DWORD)-1,
        INTERNET_FLAG_SECURE | INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE,
        0
    );

    if (!hUrl) {
        InternetCloseHandle(hInternet);
        return false;
    }

    char* buffer = (char*)malloc(65536);
    if (!buffer) {
        InternetCloseHandle(hUrl);
        InternetCloseHandle(hInternet);
        return false;
    }
    memset(buffer, 0, 65536);

    DWORD totalRead = 0;
    DWORD bytesRead = 0;
    while (InternetReadFile(hUrl, buffer + totalRead, (DWORD)(65535 - totalRead), &bytesRead) && bytesRead > 0) {
        totalRead += bytesRead;
        if (totalRead >= 65530) break;
    }
    buffer[totalRead] = '\0';

    InternetCloseHandle(hUrl);
    InternetCloseHandle(hInternet);

    // Extract tag_name
    parse_json_value(buffer, "tag_name", tag_out, tag_max);

    // Extract release body
    parse_json_value(buffer, "body", notes_out, notes_max);

    // Look for download URL in assets
    const char* asset_pos = strstr(buffer, "\"browser_download_url\":");
    if (asset_pos) {
        parse_json_value(asset_pos - 1, "browser_download_url", download_out, dl_max);
    }

    free(buffer);
    return (strlen(tag_out) > 0);
}

void register_update_module(void) {
    ritawapp_register_module("update", handle_update_action);
}

void handle_update_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp) {
    RW_UNUSED(window);
    char exe_dir[MAX_PATH] = {0};
    GetModuleFileNameA(NULL, exe_dir, MAX_PATH);
    char* last_slash = strrchr(exe_dir, '\\');
    if (last_slash) *last_slash = '\0';

    char current_bundle[MAX_PATH * 2], backup_bundle[MAX_PATH * 2], new_bundle[MAX_PATH * 2];
    snprintf(current_bundle, sizeof(current_bundle), "%s\\%s", exe_dir, RITA_BUNDLE_NAME);
    snprintf(backup_bundle, sizeof(backup_bundle), "%s\\%s.bak", exe_dir, RITA_BUNDLE_NAME);
    snprintf(new_bundle, sizeof(new_bundle), "%s\\%s.new", exe_dir, RITA_BUNDLE_NAME);

    if (strcmp(action, "getRepoUrl") == 0) {
        char esc_url[512] = {0};
        escape_json_string(RITA_REPO_URL, esc_url, sizeof(esc_url));
        snprintf(response, max_resp, "{\"success\":true,\"data\":\"%s\"}", esc_url);
    } else if (strcmp(action, "check") == 0) {
        char repo_url[512] = {0};
        parse_json_value(json_request, "repoUrl", repo_url, sizeof(repo_url));
        if (strlen(repo_url) == 0) {
            strncpy(repo_url, RITA_REPO_URL, sizeof(repo_url) - 1);
        }

        if (strlen(repo_url) == 0) {
            snprintf(response, max_resp,
                "{\"success\":false,\"error\":\"No repository URL configured in RitaWapp-config.ts\"}");
            return;
        }

        char latest_tag[64] = {0};
        char release_notes[2048] = {0};
        char download_url[512] = {0};

        bool ok = check_github_releases(repo_url, latest_tag, sizeof(latest_tag),
                                        release_notes, sizeof(release_notes),
                                        download_url, sizeof(download_url));

        if (!ok) {
            char esc_repo[512] = {0};
            escape_json_string(repo_url, esc_repo, sizeof(esc_repo));
            snprintf(response, max_resp,
                "{\"success\":true,\"data\":{"
                "\"hasUpdate\":false,"
                "\"currentVersion\":\"%s\","
                "\"latestVersion\":\"%s\","
                "\"releaseNotes\":\"No remote releases found or repository is private.\","
                "\"downloadUrl\":\"\","
                "\"repoUrl\":\"%s\""
                "}}",
                RITA_APP_VERSION, RITA_APP_VERSION, esc_repo);
            return;
        }

        // Clean "v" prefix if present
        const char* clean_tag = latest_tag;
        if (*clean_tag == 'v' || *clean_tag == 'V') clean_tag++;

        bool has_update = (strcmp(clean_tag, RITA_APP_VERSION) != 0);

        char esc_notes[4096] = {0};
        char esc_dl[512] = {0};
        char esc_repo[512] = {0};
        escape_json_string(release_notes, esc_notes, sizeof(esc_notes));
        escape_json_string(download_url, esc_dl, sizeof(esc_dl));
        escape_json_string(repo_url, esc_repo, sizeof(esc_repo));

        snprintf(response, max_resp,
            "{\"success\":true,\"data\":{"
            "\"hasUpdate\":%s,"
            "\"currentVersion\":\"%s\","
            "\"latestVersion\":\"%s\","
            "\"releaseNotes\":\"%s\","
            "\"downloadUrl\":\"%s\","
            "\"repoUrl\":\"%s\""
            "}}",
            has_update ? "true" : "false",
            RITA_APP_VERSION,
            clean_tag,
            esc_notes,
            esc_dl,
            esc_repo
        );
    } else if (strcmp(action, "download") == 0) {
        char download_url[1024] = {0};
        parse_json_value(json_request, "url", download_url, sizeof(download_url));
        if (strlen(download_url) == 0) {
            parse_json_value(json_request, "downloadUrl", download_url, sizeof(download_url));
        }

        if (strlen(download_url) == 0) {
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Missing 'downloadUrl' in request\"}");
            return;
        }

        // Download directly to Rita.W.app.new
        HRESULT hr = URLDownloadToFileA(NULL, download_url, new_bundle, 0, NULL);
        if (SUCCEEDED(hr)) {
            char esc_path[MAX_PATH * 2] = {0};
            escape_json_string(new_bundle, esc_path, sizeof(esc_path));
            snprintf(response, max_resp, "{\"success\":true,\"data\":{\"targetPath\":\"%s\"}}", esc_path);
        } else {
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Download failed with HRESULT 0x%08lX\"}", (unsigned long)hr);
        }
    } else if (strcmp(action, "install") == 0) {
        MoveFileExA(current_bundle, backup_bundle, MOVEFILE_REPLACE_EXISTING);
        BOOL ok = MoveFileExA(new_bundle, current_bundle, MOVEFILE_REPLACE_EXISTING);
        snprintf(response, max_resp, "{\"success\":%s}", ok ? "true" : "false");
    } else if (strcmp(action, "rollback") == 0) {
        BOOL ok = MoveFileExA(backup_bundle, current_bundle, MOVEFILE_REPLACE_EXISTING);
        snprintf(response, max_resp, "{\"success\":%s}", ok ? "true" : "false");
    } else {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Unknown update action: '%s'\"}", action);
    }
}
