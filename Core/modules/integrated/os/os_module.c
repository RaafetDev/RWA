/**
 * ============================================================================
 * RDevCore/modules/integrated/os/os_module.c
 * ============================================================================
 * Node.js-compatible Operating System Native C Implementation
 * Supports hardware identification (CPU ID, Hard Drive ID, Motherboard ID)
 * and cryptographic machine fingerprinting.
 * ============================================================================
 */

#include "os_module.h"
#include "ritawapp_modules.h"
#include <windows.h>
#include <shlobj.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <cpuid.h>
#include <winioctl.h>
#include <bcrypt.h>

static void get_machine_guid(char* out, size_t max_len);

/**
 * Extracts processor identification signature via x86/x64 CPUID instruction.
 */
static void get_cpu_id(char* out, size_t max_len) {
    unsigned int eax = 0, ebx = 0, ecx = 0, edx = 0;
    if (__get_cpuid(1, &eax, &ebx, &ecx, &edx)) {
        snprintf(out, max_len, "%08X%08X", edx, eax);
    } else {
        snprintf(out, max_len, "GENERIC_X64_CPU");
    }
}

/**
 * Queries physical drive hardware serial number via IOCTL_STORAGE_QUERY_PROPERTY,
 * with graceful fallback to system volume serial number.
 */
static void get_harddrive_id(char* out, size_t max_len) {
    out[0] = '\0';
    HANDLE hDrive = CreateFileA(
        "\\\\.\\PhysicalDrive0",
        0,
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        NULL,
        OPEN_EXISTING,
        0,
        NULL
    );

    if (hDrive != INVALID_HANDLE_VALUE) {
        STORAGE_PROPERTY_QUERY query;
        ZeroMemory(&query, sizeof(query));
        query.PropertyId = StorageDeviceProperty;
        query.QueryType = PropertyStandardQuery;
        char buffer[1024] = {0};
        DWORD bytesReturned = 0;
        if (DeviceIoControl(hDrive, IOCTL_STORAGE_QUERY_PROPERTY, &query, sizeof(query), buffer, sizeof(buffer), &bytesReturned, NULL)) {
            STORAGE_DEVICE_DESCRIPTOR* desc = (STORAGE_DEVICE_DESCRIPTOR*)buffer;
            if (desc->SerialNumberOffset > 0 && desc->SerialNumberOffset < bytesReturned) {
                const char* serial = buffer + desc->SerialNumberOffset;
                while (*serial == ' ' || *serial == '\t') serial++;
                strncpy(out, serial, max_len - 1);
                size_t len = strlen(out);
                while (len > 0 && (out[len - 1] == ' ' || out[len - 1] == '\r' || out[len - 1] == '\n')) {
                    out[--len] = '\0';
                }
            }
        }
        CloseHandle(hDrive);
    }

    // Fallback to System Volume Serial Number
    if (strlen(out) == 0 || _stricmp(out, "None") == 0) {
        char sys_dir[MAX_PATH] = {0};
        char root[4] = "C:\\";
        if (GetSystemDirectoryA(sys_dir, sizeof(sys_dir)) > 0) {
            root[0] = sys_dir[0];
        }
        DWORD vol_serial = 0;
        if (GetVolumeInformationA(root, NULL, 0, &vol_serial, NULL, NULL, NULL, 0)) {
            snprintf(out, max_len, "%04X-%04X", (unsigned int)((vol_serial >> 16) & 0xFFFF), (unsigned int)(vol_serial & 0xFFFF));
        }
    }

    if (strlen(out) == 0 || _stricmp(out, "None") == 0) {
        char guid[128] = {0};
        get_machine_guid(guid, sizeof(guid));
        if (guid[0]) {
            snprintf(out, max_len, "DISK-%.100s", guid);
        } else {
            snprintf(out, max_len, "DISK-STABLE-STORAGE-0");
        }
    }
}

/**
 * Extracts motherboard information by checking BIOS registry and raw SMBIOS tables.
 */
static void get_motherboard_id(char* out, size_t max_len) {
    char mfg[128] = {0};
    char prod[128] = {0};
    char serial[128] = {0};
    char uuid_str[64] = {0};

    // 1. Query BIOS registry
    HKEY hKey;
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "HARDWARE\\DESCRIPTION\\System\\BIOS", 0, KEY_READ, &hKey) == ERROR_SUCCESS) {
        DWORD s = sizeof(mfg);
        RegQueryValueExA(hKey, "BaseBoardManufacturer", NULL, NULL, (LPBYTE)mfg, &s);
        s = sizeof(prod);
        RegQueryValueExA(hKey, "BaseBoardProduct", NULL, NULL, (LPBYTE)prod, &s);
        s = sizeof(serial);
        RegQueryValueExA(hKey, "BaseBoardSerialNumber", NULL, NULL, (LPBYTE)serial, &s);
        RegCloseKey(hKey);
    }

    // 2. Query SMBIOS UUID via GetSystemFirmwareTable (0x52534D42 = 'RSMB')
    DWORD smbSize = GetSystemFirmwareTable(0x52534D42, 0, NULL, 0);
    if (smbSize > 0) {
        BYTE* smbData = (BYTE*)malloc(smbSize);
        if (smbData) {
            if (GetSystemFirmwareTable(0x52534D42, 0, smbData, smbSize) == smbSize) {
                if (smbSize > 8) {
                    BYTE* ptr = smbData + 8;
                    BYTE* end = smbData + smbSize;
                    while (ptr + 4 < end) {
                        BYTE type = ptr[0];
                        BYTE len = ptr[1];
                        if (len < 4) break;
                        if (type == 1 && len >= 0x19) { // System Information
                            BYTE* u = ptr + 8;
                            snprintf(uuid_str, sizeof(uuid_str),
                                "%02X%02X%02X%02X-%02X%02X-%02X%02X-%02X%02X-%02X%02X%02X%02X%02X%02X",
                                u[3], u[2], u[1], u[0], u[5], u[4], u[7], u[6],
                                u[8], u[9], u[10], u[11], u[12], u[13], u[14], u[15]);
                            break;
                        }
                        ptr += len;
                        while (ptr + 1 < end && (*ptr != 0 || *(ptr + 1) != 0)) ptr++;
                        ptr += 2;
                    }
                }
            }
            free(smbData);
        }
    }

    // Format best stable identifier
    if (strlen(serial) > 0 && 
        _stricmp(serial, "To be filled by O.E.M.") != 0 &&
        _stricmp(serial, "None") != 0 &&
        _stricmp(serial, "Default string") != 0) {
        snprintf(out, max_len, "%s", serial);
    } else if (strlen(uuid_str) > 0 && strcmp(uuid_str, "00000000-0000-0000-0000-000000000000") != 0) {
        if (strlen(prod) > 0) {
            snprintf(out, max_len, "%.60s-%.60s", prod, uuid_str);
        } else {
            snprintf(out, max_len, "%s", uuid_str);
        }
    } else if (strlen(prod) > 0) {
        snprintf(out, max_len, "%.60s-%.60s", mfg, prod);
    } else {
        char guid[128] = {0};
        get_machine_guid(guid, sizeof(guid));
        if (guid[0]) {
            snprintf(out, max_len, "MB-%.100s", guid);
        } else {
            snprintf(out, max_len, "MB-STABLE-BOARD-0");
        }
    }
}

/**
 * Extracts Windows installation Cryptography MachineGuid.
 */
static void get_machine_guid(char* out, size_t max_len) {
    HKEY hKey;
    out[0] = '\0';
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Cryptography", 0, KEY_READ | KEY_WOW64_64KEY, &hKey) == ERROR_SUCCESS) {
        DWORD s = (DWORD)max_len;
        RegQueryValueExA(hKey, "MachineGuid", NULL, NULL, (LPBYTE)out, &s);
        RegCloseKey(hKey);
    }
}

/**
 * Computes a cryptographically secure, permanent SHA-256 hardware machine fingerprint.
 * Combines CPU ID, Hard Drive ID, Motherboard ID, and Windows MachineGuid.
 */
static void get_fingerprint(char* out, size_t max_len) {
    char cpuid[64] = {0};
    char hdid[128] = {0};
    char mbid[128] = {0};
    char guid[128] = {0};

    get_cpu_id(cpuid, sizeof(cpuid));
    get_harddrive_id(hdid, sizeof(hdid));
    get_motherboard_id(mbid, sizeof(mbid));
    get_machine_guid(guid, sizeof(guid));

    char raw[512] = {0};
    snprintf(raw, sizeof(raw), "CPU:%s;HD:%s;MB:%s;GUID:%s", cpuid, hdid, mbid, guid);

    BCRYPT_ALG_HANDLE hAlg = NULL;
    BCRYPT_HASH_HANDLE hHash = NULL;
    BYTE hash[32] = {0};

    if (BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, NULL, 0) == 0) {
        if (BCryptCreateHash(hAlg, &hHash, NULL, 0, NULL, 0, 0) == 0) {
            BCryptHashData(hHash, (PUCHAR)raw, (ULONG)strlen(raw), 0);
            BCryptFinishHash(hHash, hash, sizeof(hash), 0);
            BCryptDestroyHash(hHash);
        }
        BCryptCloseAlgorithmProvider(hAlg, 0);
    }

    char hex[65] = {0};
    for (int i = 0; i < 32; i++) {
        sprintf(hex + (i * 2), "%02x", hash[i]);
    }
    strncpy(out, hex, max_len - 1);
}

// Global cached hardware identification for zero-latency instant responses
static char s_cached_cpu_id[64] = {0};
static char s_cached_hd_id[256] = {0};
static char s_cached_mb_id[256] = {0};
static char s_cached_fp[256] = {0};
static bool s_hw_cached = false;

static void ensure_hw_cached(void) {
    if (!s_hw_cached) {
        get_cpu_id(s_cached_cpu_id, sizeof(s_cached_cpu_id));
        get_harddrive_id(s_cached_hd_id, sizeof(s_cached_hd_id));
        get_motherboard_id(s_cached_mb_id, sizeof(s_cached_mb_id));
        get_fingerprint(s_cached_fp, sizeof(s_cached_fp));
        s_hw_cached = true;
    }
}

void register_os_module(void) {
    ensure_hw_cached();
    ritawapp_register_module("os", handle_os_action);
}

void handle_os_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp) {
    RW_UNUSED(window);
    RW_UNUSED(json_request);
    if (strcmp(action, "getInfo") == 0) {
        ensure_hw_cached();
        char hostname[MAX_COMPUTERNAME_LENGTH + 1] = {0};
        DWORD h_len = sizeof(hostname);
        GetComputerNameA(hostname, &h_len);

        MEMORYSTATUSEX ms;
        ms.dwLength = sizeof(ms);
        GlobalMemoryStatusEx(&ms);

        SYSTEM_INFO si;
        GetSystemInfo(&si);

        char homedir[MAX_PATH] = {0};
        SHGetFolderPathA(NULL, CSIDL_PROFILE, NULL, 0, homedir);

        char tmpdir[MAX_PATH] = {0};
        GetTempPathA(MAX_PATH, tmpdir);

        ULONGLONG uptime_sec = GetTickCount64() / 1000;

        char esc_home[MAX_PATH * 2] = {0};
        escape_json_string(homedir, esc_home, sizeof(esc_home));

        char esc_tmp[MAX_PATH * 2] = {0};
        escape_json_string(tmpdir, esc_tmp, sizeof(esc_tmp));

        char esc_cpu[128] = {0};
        char esc_hd[256] = {0};
        char esc_mb[256] = {0};
        char esc_fp[256] = {0};

        escape_json_string(s_cached_cpu_id, esc_cpu, sizeof(esc_cpu));
        escape_json_string(s_cached_hd_id, esc_hd, sizeof(esc_hd));
        escape_json_string(s_cached_mb_id, esc_mb, sizeof(esc_mb));
        escape_json_string(s_cached_fp, esc_fp, sizeof(esc_fp));

        snprintf(response, max_resp,
            "{\"success\":true,\"data\":{"
            "\"platform\":\"win32\","
            "\"arch\":\"x64\","
            "\"hostname\":\"%s\","
            "\"cpuCount\":%lu,"
            "\"uptime\":%llu,"
            "\"totalmem\":%llu,"
            "\"freemem\":%llu,"
            "\"homedir\":\"%s\","
            "\"tmpdir\":\"%s\","
            "\"cpuid\":\"%s\","
            "\"harddriveId\":\"%s\","
            "\"motherboardId\":\"%s\","
            "\"fingerprint\":\"%s\""
            "}}",
            hostname,
            si.dwNumberOfProcessors,
            uptime_sec,
            ms.ullTotalPhys,
            ms.ullAvailPhys,
            esc_home,
            esc_tmp,
            esc_cpu,
            esc_hd,
            esc_mb,
            esc_fp
        );
    } else if (strcmp(action, "cpuid") == 0 || strcmp(action, "cpuId") == 0) {
        ensure_hw_cached();
        char esc[128] = {0};
        escape_json_string(s_cached_cpu_id, esc, sizeof(esc));
        snprintf(response, max_resp, "{\"success\":true,\"data\":\"%s\"}", esc);
    } else if (strcmp(action, "harddriveId") == 0 || strcmp(action, "hardDriveId") == 0 || strcmp(action, "diskId") == 0) {
        ensure_hw_cached();
        char esc[256] = {0};
        escape_json_string(s_cached_hd_id, esc, sizeof(esc));
        snprintf(response, max_resp, "{\"success\":true,\"data\":\"%s\"}", esc);
    } else if (strcmp(action, "motherboardId") == 0 || strcmp(action, "motherBoardId") == 0) {
        ensure_hw_cached();
        char esc[256] = {0};
        escape_json_string(s_cached_mb_id, esc, sizeof(esc));
        snprintf(response, max_resp, "{\"success\":true,\"data\":\"%s\"}", esc);
    } else if (strcmp(action, "fingerprint") == 0 || strcmp(action, "getFingerprint") == 0 || strcmp(action, "machineId") == 0) {
        ensure_hw_cached();
        char esc[256] = {0};
        escape_json_string(s_cached_fp, esc, sizeof(esc));
        snprintf(response, max_resp, "{\"success\":true,\"data\":\"%s\"}", esc);
    } else if (strcmp(action, "platform") == 0) {
        snprintf(response, max_resp, "{\"success\":true,\"data\":\"win32\"}");
    } else if (strcmp(action, "arch") == 0) {
        snprintf(response, max_resp, "{\"success\":true,\"data\":\"x64\"}");
    } else if (strcmp(action, "uptime") == 0) {
        ULONGLONG sec = GetTickCount64() / 1000;
        snprintf(response, max_resp, "{\"success\":true,\"data\":%llu}", sec);
    } else if (strcmp(action, "totalmem") == 0) {
        MEMORYSTATUSEX ms;
        ms.dwLength = sizeof(ms);
        GlobalMemoryStatusEx(&ms);
        snprintf(response, max_resp, "{\"success\":true,\"data\":%llu}", ms.ullTotalPhys);
    } else if (strcmp(action, "freemem") == 0) {
        MEMORYSTATUSEX ms;
        ms.dwLength = sizeof(ms);
        GlobalMemoryStatusEx(&ms);
        snprintf(response, max_resp, "{\"success\":true,\"data\":%llu}", ms.ullAvailPhys);
    } else if (strcmp(action, "homedir") == 0) {
        char homedir[MAX_PATH] = {0};
        SHGetFolderPathA(NULL, CSIDL_PROFILE, NULL, 0, homedir);
        char esc[MAX_PATH * 2] = {0};
        escape_json_string(homedir, esc, sizeof(esc));
        snprintf(response, max_resp, "{\"success\":true,\"data\":\"%s\"}", esc);
    } else if (strcmp(action, "tmpdir") == 0) {
        char tmpdir[MAX_PATH] = {0};
        GetTempPathA(MAX_PATH, tmpdir);
        char esc[MAX_PATH * 2] = {0};
        escape_json_string(tmpdir, esc, sizeof(esc));
        snprintf(response, max_resp, "{\"success\":true,\"data\":\"%s\"}", esc);
    } else {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Unknown os action: '%s'\"}", action);
    }
}
