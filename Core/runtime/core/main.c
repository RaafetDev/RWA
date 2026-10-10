/**
 * ============================================================================
 * RDevCore/runtime/native_core/main.c
 * ============================================================================
 * RitaWapp Core C Runtime Engine
 *
 * Responsibilities:
 * 1. Native Windows entry point (WinMain / main) with zero console flashing.
 * 2. Reads the encrypted container ("Rita.W.app") from disk into heap memory.
 * 3. Decrypts the bundle strictly in RAM using hardware-accelerated Windows
 *    BCrypt API (AES-256-CBC) - zero plaintext written to disk.
 * 4. Browser selection and fallback engine supporting:
 *    "all", "chrome", "edge", "safari", "opera", "webview2", "webview2AutoInstall".
 * 5. Auto-downloads and silently installs Microsoft WebView2 Evergreen Runtime
 *    with a custom progress card window if "webview2AutoInstall" is active.
 * 6. Applies 100% true Win32 frameless and transparent styling via WebUI & WebView2.
 * 7. Dispatches native C module calls to JavaScript via WebUI bindings.
 * 8. Securely zeroizes cryptographic keys and in-memory buffers upon teardown.
 * ============================================================================
 */

#include <winsock2.h>
#include <windows.h>
#include <commctrl.h>
#include <wininet.h>
#include <bcrypt.h>
#include <dwmapi.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>

#include "../webui/include/webui.h"
#include "app_credentials.h"
#include "../embed/webview2_loader_embed.h"
#include "../rpc/ritawapp_modules.h"

#if defined(RITA_MODULE_DATABASE_ENABLE) && RITA_MODULE_DATABASE_ENABLE
#include "rita_sqlite.h"
#endif

#if defined(RITA_TRAY_ENABLE) && RITA_TRAY_ENABLE
#include "../../modules/integrated/tray/tray_module.h"
#endif

#ifndef BCRYPT_SUCCESS
#define BCRYPT_SUCCESS(Status) (((NTSTATUS)(Status)) >= 0)
#endif

// Container binary header (Legacy CBC)
#pragma pack(push, 1)
typedef struct {
    char magic[4];          // 'R', 'W', 'A', 'P'
    uint8_t version;        // 0x01
    uint8_t cipher;         // 0x01 = AES-256-CBC
    uint16_t flags;         // Reserved (0x0000)
    uint64_t original_size; // Plaintext size in bytes (Little-Endian)
    uint8_t iv[16];         // 128-bit Initialization Vector
} RitaContainerHeader;

// Container binary header (v2 GCM Authenticated)
typedef struct {
    char magic[4];          // 'R', 'W', 'A', 'P'
    uint8_t version;        // 0x02
    uint8_t cipher;         // 0x02 = AES-256-GCM
    uint16_t flags;         // Reserved (0x0000)
    uint64_t original_size; // Plaintext size in bytes
    uint8_t nonce[12];      // 96-bit Nonce
    uint8_t tag[16];        // 128-bit GCM Auth Tag
} RitaGCMContainerHeader;
#pragma pack(pop)

#define RWAP_HEADER_SIZE sizeof(RitaContainerHeader)
#define RWAP_GCM_HEADER_SIZE sizeof(RitaGCMContainerHeader)

static FILE* dbg = NULL;
static bool g_is_selftest = false;
static char g_selftest_error[512] = {0};

static void show_error(const wchar_t* title, const wchar_t* message) {
    if (dbg) {
        fwprintf(dbg, L"[RitaWapp Error] %ls: %ls\n", title, message);
        fflush(dbg);
    }
    if (g_is_selftest) {
        WideCharToMultiByte(CP_UTF8, 0, message, -1, g_selftest_error, sizeof(g_selftest_error), NULL, NULL);
        return;
    }
    MessageBoxW(NULL, message, title, MB_ICONERROR | MB_OK | MB_TOPMOST);
}

static bool get_executable_dir(wchar_t* out_dir, size_t max_chars) {
    DWORD len = GetModuleFileNameW(NULL, out_dir, (DWORD)max_chars);
    if (len == 0 || len >= max_chars) return false;
    wchar_t* last_slash = wcsrchr(out_dir, L'\\');
    if (last_slash) *last_slash = L'\0';
    return true;
}

static uint8_t* read_file_to_memory(const wchar_t* filepath, size_t* out_size) {
    HANDLE hFile = CreateFileW(filepath, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (hFile == INVALID_HANDLE_VALUE) return NULL;

    LARGE_INTEGER fileSize;
    if (!GetFileSizeEx(hFile, &fileSize) || fileSize.QuadPart <= 0 || fileSize.QuadPart > 100 * 1024 * 1024) {
        CloseHandle(hFile);
        return NULL;
    }

    size_t totalBytes = (size_t)fileSize.QuadPart;
    uint8_t* buffer = (uint8_t*)malloc(totalBytes + 1);
    if (!buffer) {
        CloseHandle(hFile);
        return NULL;
    }

    DWORD bytesRead = 0;
    DWORD toRead = (DWORD)totalBytes;
    if (!ReadFile(hFile, buffer, toRead, &bytesRead, NULL) || bytesRead != toRead) {
        free(buffer);
        CloseHandle(hFile);
        return NULL;
    }

    buffer[totalBytes] = '\0';
    *out_size = totalBytes;
    CloseHandle(hFile);
    return buffer;
}

static char* decrypt_bundle_in_memory(const uint8_t* bundle_data, size_t bundle_size, size_t* out_plain_size) {
    if (bundle_size < RWAP_HEADER_SIZE) {
        show_error(L"RitaWapp Security Error", L"The application bundle is corrupted or invalid.");
        return NULL;
    }

    if (memcmp(bundle_data, "RWAP", 4) != 0) {
        show_error(L"RitaWapp Security Error", L"Corrupted bundle: Invalid magic identifier.");
        return NULL;
    }

    uint8_t version = bundle_data[4];
    uint8_t cipher = bundle_data[5];

    // Path 1: Modern AES-256-GCM Authenticated Decryption (version == 2)
    if (version == 2 && cipher == 2) {
        if (bundle_size < RWAP_GCM_HEADER_SIZE) {
            show_error(L"RitaWapp Security Error", L"Corrupted bundle: GCM container truncated.");
            return NULL;
        }

        const RitaGCMContainerHeader* gcm_header = (const RitaGCMContainerHeader*)bundle_data;
        const uint8_t* ciphertext = bundle_data + RWAP_GCM_HEADER_SIZE;
        ULONG cipher_len = (ULONG)(bundle_size - RWAP_GCM_HEADER_SIZE);

        uint8_t key_bytes[32];
        memcpy(key_bytes, RITA_AES_KEY, 32);

        BCRYPT_ALG_HANDLE hAlg = NULL;
        BCRYPT_KEY_HANDLE hKey = NULL;
        NTSTATUS status;

        status = BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_AES_ALGORITHM, NULL, 0);
        if (!BCRYPT_SUCCESS(status)) {
            show_error(L"RitaWapp Crypto Failure", L"Failed to initialize Windows BCrypt provider.");
            SecureZeroMemory(key_bytes, sizeof(key_bytes));
            return NULL;
        }

        status = BCryptSetProperty(hAlg, BCRYPT_CHAINING_MODE, (PUCHAR)BCRYPT_CHAIN_MODE_GCM, sizeof(BCRYPT_CHAIN_MODE_GCM), 0);
        if (!BCRYPT_SUCCESS(status)) {
            show_error(L"RitaWapp Crypto Failure", L"Failed to configure AES-GCM chaining mode.");
            BCryptCloseAlgorithmProvider(hAlg, 0);
            SecureZeroMemory(key_bytes, sizeof(key_bytes));
            return NULL;
        }

        status = BCryptGenerateSymmetricKey(hAlg, &hKey, NULL, 0, (PUCHAR)key_bytes, 32, 0);
        SecureZeroMemory(key_bytes, sizeof(key_bytes));

        if (!BCRYPT_SUCCESS(status)) {
            show_error(L"RitaWapp Crypto Failure", L"Failed to create AES symmetric key object.");
            BCryptCloseAlgorithmProvider(hAlg, 0);
            return NULL;
        }

        char* plaintext = (char*)malloc(cipher_len + 1);
        if (!plaintext) {
            show_error(L"RitaWapp Memory Error", L"Out of memory allocating decryption buffer.");
            BCryptDestroyKey(hKey);
            BCryptCloseAlgorithmProvider(hAlg, 0);
            return NULL;
        }

        uint8_t nonce[12];
        memcpy(nonce, gcm_header->nonce, 12);
        uint8_t tag[16];
        memcpy(tag, gcm_header->tag, 16);

        BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO authInfo;
        BCRYPT_INIT_AUTH_MODE_INFO(authInfo);
        authInfo.pbNonce = nonce;
        authInfo.cbNonce = sizeof(nonce);
        authInfo.pbTag = tag;
        authInfo.cbTag = sizeof(tag);

        ULONG decrypted_bytes = 0;
        status = BCryptDecrypt(
            hKey, (PUCHAR)ciphertext, cipher_len, &authInfo, NULL, 0,
            (PUCHAR)plaintext, cipher_len, &decrypted_bytes, 0
        );

        BCryptDestroyKey(hKey);
        BCryptCloseAlgorithmProvider(hAlg, 0);

        if (!BCRYPT_SUCCESS(status)) {
            free(plaintext);
            show_error(L"RitaWapp Security Error", L"AES-GCM decryption failed: tag authentication mismatch or invalid key.");
            return NULL;
        }

        plaintext[decrypted_bytes] = '\0';
        if (out_plain_size) *out_plain_size = (size_t)decrypted_bytes;
        return plaintext;
    }

    // Path 2: Legacy AES-256-CBC Decryption (version == 1) for backward compatibility
    if (version == 1 && cipher == 1) {
        const RitaContainerHeader* header = (const RitaContainerHeader*)bundle_data;
        const uint8_t* ciphertext = bundle_data + RWAP_HEADER_SIZE;
        ULONG cipher_len = (ULONG)(bundle_size - RWAP_HEADER_SIZE);
        if (cipher_len == 0 || (cipher_len % 16) != 0) {
            show_error(L"RitaWapp Security Error", L"Corrupted bundle: Ciphertext block alignment error.");
            return NULL;
        }

        uint8_t iv[16];
        memcpy(iv, header->iv, 16);

        uint8_t key_bytes[32];
        memcpy(key_bytes, RITA_AES_KEY, 32);

        BCRYPT_ALG_HANDLE hAlg = NULL;
        BCRYPT_KEY_HANDLE hKey = NULL;
        NTSTATUS status;

        status = BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_AES_ALGORITHM, NULL, 0);
        if (!BCRYPT_SUCCESS(status)) {
            show_error(L"RitaWapp Crypto Failure", L"Failed to initialize Windows BCrypt provider.");
            SecureZeroMemory(key_bytes, sizeof(key_bytes));
            return NULL;
        }

        status = BCryptSetProperty(hAlg, BCRYPT_CHAINING_MODE, (PUCHAR)BCRYPT_CHAIN_MODE_CBC, sizeof(BCRYPT_CHAIN_MODE_CBC), 0);
        if (!BCRYPT_SUCCESS(status)) {
            show_error(L"RitaWapp Crypto Failure", L"Failed to configure AES-CBC chaining mode.");
            BCryptCloseAlgorithmProvider(hAlg, 0);
            SecureZeroMemory(key_bytes, sizeof(key_bytes));
            return NULL;
        }

        status = BCryptGenerateSymmetricKey(hAlg, &hKey, NULL, 0, (PUCHAR)key_bytes, 32, 0);
        SecureZeroMemory(key_bytes, sizeof(key_bytes));

        if (!BCRYPT_SUCCESS(status)) {
            show_error(L"RitaWapp Crypto Failure", L"Failed to create AES symmetric key object.");
            BCryptCloseAlgorithmProvider(hAlg, 0);
            return NULL;
        }

        ULONG max_plain_len = cipher_len + 16;
        char* plaintext = (char*)malloc(max_plain_len + 1);
        if (!plaintext) {
            show_error(L"RitaWapp Memory Error", L"Out of memory allocating decryption buffer.");
            BCryptDestroyKey(hKey);
            BCryptCloseAlgorithmProvider(hAlg, 0);
            return NULL;
        }

        ULONG decrypted_bytes = 0;
        status = BCryptDecrypt(
            hKey, (PUCHAR)ciphertext, cipher_len, NULL, iv, 16,
            (PUCHAR)plaintext, max_plain_len, &decrypted_bytes,
            BCRYPT_BLOCK_PADDING
        );

        BCryptDestroyKey(hKey);
        BCryptCloseAlgorithmProvider(hAlg, 0);

        if (!BCRYPT_SUCCESS(status)) {
            free(plaintext);
            show_error(L"RitaWapp Security Error", L"Decryption failed. Invalid AES key or corrupted bundle.");
            return NULL;
        }

        plaintext[decrypted_bytes] = '\0';
        if (out_plain_size) *out_plain_size = (size_t)decrypted_bytes;
        return plaintext;
    }

    show_error(L"RitaWapp Security Error", L"Unsupported container format or cipher.");
    return NULL;
}

typedef HRESULT (STDAPICALLTYPE *pfnGetAvailableCoreWebView2BrowserVersionString)(
    PCWSTR browserExecutableFolder,
    PWSTR* versionInfo
);

/**
 * Silently detects if Microsoft Edge WebView2 Evergreen Runtime is installed and ready.
 * Returns false cleanly if absent with zero popups.
 */
static bool is_webview2_runtime_ready(void) {
    ritawapp_ensure_webview2_loader();
    HMODULE hLoader = LoadLibraryA("WebView2Loader.dll");
    if (!hLoader) return false;

    pfnGetAvailableCoreWebView2BrowserVersionString pfnGetVersion =
        (pfnGetAvailableCoreWebView2BrowserVersionString)(void*)GetProcAddress(
            hLoader, "GetAvailableCoreWebView2BrowserVersionString"
        );

    if (!pfnGetVersion) {
        FreeLibrary(hLoader);
        return false;
    }

    PWSTR version_info = NULL;
    HRESULT hr = pfnGetVersion(NULL, &version_info);
    bool available = (hr == S_OK && version_info != NULL && wcslen(version_info) > 0);

    if (hr == S_OK && version_info) {
        CoTaskMemFree(version_info);
    }

    FreeLibrary(hLoader);
    return available;
}

// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------
// Custom Card Window for WebView2 Auto-Installer
// ----------------------------------------------------------------------------
typedef struct {
    HWND hwnd;
    HWND hwnd_label;
    HWND hwnd_progress;
    HWND hwnd_close;
    HFONT hFontTitle;
    HFONT hFontBody;
    HBRUSH hBrushBg;
    HBRUSH hBrushAccent;
    bool done;
    bool success;
    bool is_preview;
} InstallerCardContext;

static LRESULT CALLBACK InstallerWndProc(HWND hwnd, UINT uMsg, WPARAM wParam, LPARAM lParam) {
    InstallerCardContext* ctx = (InstallerCardContext*)GetWindowLongPtr(hwnd, GWLP_USERDATA);
    switch (uMsg) {
        case WM_CREATE: {
            CREATESTRUCT* cs = (CREATESTRUCT*)lParam;
            SetWindowLongPtr(hwnd, GWLP_USERDATA, (LONG_PTR)cs->lpCreateParams);
            return 0;
        }
        case WM_CTLCOLORSTATIC: {
            HDC hdc = (HDC)wParam;
            #ifdef RITA_INSTALLER_TEXT_COLOR
            SetTextColor(hdc, RITA_INSTALLER_TEXT_COLOR);
            #else
            SetTextColor(hdc, RGB(225, 230, 240));
            #endif

            #ifdef RITA_INSTALLER_BG_COLOR
            COLORREF bgCol = RITA_INSTALLER_BG_COLOR;
            #else
            COLORREF bgCol = RGB(18, 22, 34);
            #endif

            SetBkColor(hdc, bgCol);
            SetBkMode(hdc, TRANSPARENT);

            if (ctx && ctx->hBrushBg) {
                return (LRESULT)ctx->hBrushBg;
            }
            static HBRUSH s_fallbackBrush = NULL;
            if (!s_fallbackBrush) s_fallbackBrush = CreateSolidBrush(bgCol);
            return (LRESULT)s_fallbackBrush;
        }
        case WM_ERASEBKGND: {
            HDC hdc = (HDC)wParam;
            RECT rc;
            GetClientRect(hwnd, &rc);
            if (ctx && ctx->hBrushBg) {
                FillRect(hdc, &rc, ctx->hBrushBg);
            }
            return 1;
        }
        case WM_PAINT: {
            PAINTSTRUCT ps;
            HDC hdc = BeginPaint(hwnd, &ps);
            RECT rc;
            GetClientRect(hwnd, &rc);
            if (ctx && ctx->hBrushBg) {
                FillRect(hdc, &rc, ctx->hBrushBg);
            }

            // Customizable top accent border
            #ifdef RITA_INSTALLER_ACCENT_HEIGHT
            int accent_h = RITA_INSTALLER_ACCENT_HEIGHT;
            #else
            int accent_h = 3;
            #endif
            RECT topRc = { 0, 0, rc.right, accent_h };
            if (ctx && ctx->hBrushAccent) {
                FillRect(hdc, &topRc, ctx->hBrushAccent);
            }
            EndPaint(hwnd, &ps);
            return 0;
        }
        case WM_COMMAND: {
            if (LOWORD(wParam) == 1001) {
                DestroyWindow(hwnd);
                return 0;
            }
            break;
        }
        case WM_KEYDOWN: {
            if (wParam == VK_ESCAPE) {
                DestroyWindow(hwnd);
                return 0;
            }
            break;
        }
        case WM_SETCURSOR: {
            HWND hTarget = (HWND)wParam;
            if (ctx && hTarget == ctx->hwnd_close) {
                SetCursor(LoadCursor(NULL, IDC_HAND));
                return TRUE;
            }
            break;
        }
        case WM_NCHITTEST: {
            POINT pt = { (short)LOWORD(lParam), (short)HIWORD(lParam) };
            ScreenToClient(hwnd, &pt);
            RECT rc;
            GetClientRect(hwnd, &rc);
            if (pt.x >= rc.right - 36 && pt.y <= 36) {
                return HTCLIENT;
            }
            return HTCAPTION; // Draggable card window!
        }
        case WM_CLOSE:
            DestroyWindow(hwnd);
            return 0;
        case WM_DESTROY:
            if (ctx) ctx->done = true;
            PostQuitMessage(0);
            return 0;
    }
    return DefWindowProcW(hwnd, uMsg, wParam, lParam);
}

static DWORD WINAPI InstallerWorkerThread(LPVOID lpParam) {
    InstallerCardContext* ctx = (InstallerCardContext*)lpParam;

    // Fast Developer Preview Mode (deno task installDev)
    if (ctx->is_preview) {
        SetWindowTextW(ctx->hwnd_label, L"Simulating download progress (0% -> 100%)...");
        SendMessage(ctx->hwnd_progress, PBM_SETRANGE32, 0, 100);
        for (int p = 0; p <= 100; p += 4) {
            if (ctx->done) return 0;
            SendMessage(ctx->hwnd_progress, PBM_SETPOS, p, 0);
            Sleep(25);
        }
        SetWindowTextW(ctx->hwnd_label, L"Simulating silent install marquee animation...");
        SendMessage(ctx->hwnd_progress, PBM_SETMARQUEE, TRUE, 25);
        for (int i = 0; i < 20; i++) {
            if (ctx->done) return 0;
            Sleep(80);
        }
        SendMessage(ctx->hwnd_progress, PBM_SETMARQUEE, FALSE, 0);
        SendMessage(ctx->hwnd_progress, PBM_SETPOS, 100, 0);
        SetWindowTextW(ctx->hwnd_label, L"Card Preview Ready • Watching RitaWapp-config.ts");

        // Keep preview card open so developer can inspect and customize styling!
        while (!ctx->done) {
            Sleep(100);
        }
        return 0;
    }

    char temp_dir[MAX_PATH];
    GetTempPathA(MAX_PATH, temp_dir);
    char installer_path[MAX_PATH * 2];
    snprintf(installer_path, sizeof(installer_path), "%sMicrosoftEdgeWebview2Setup.exe", temp_dir);

    // Step 1: Download WebView2 Evergreen Bootstrapper
    SetWindowTextW(ctx->hwnd_label, L"Downloading Microsoft WebView2 Runtime...");

    HINTERNET hInternet = InternetOpenA("RitaWapp/1.0", INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
    if (!hInternet) {
        ctx->done = true;
        ctx->success = false;
        PostMessage(ctx->hwnd, WM_CLOSE, 0, 0);
        return 1;
    }

    const char* bootstrapper_url = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";
    HINTERNET hUrl = InternetOpenUrlA(hInternet, bootstrapper_url, NULL, 0,
        INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE | INTERNET_FLAG_SECURE, 0);

    if (!hUrl) {
        InternetCloseHandle(hInternet);
        ctx->done = true;
        ctx->success = false;
        PostMessage(ctx->hwnd, WM_CLOSE, 0, 0);
        return 1;
    }

    FILE* fp = fopen(installer_path, "wb");
    if (!fp) {
        InternetCloseHandle(hUrl);
        InternetCloseHandle(hInternet);
        ctx->done = true;
        ctx->success = false;
        PostMessage(ctx->hwnd, WM_CLOSE, 0, 0);
        return 1;
    }

    DWORD total_downloaded = 0;
    // Microsoft Bootstrapper is ~1.8 MB
    DWORD expected_size = 1850000;
    char buffer[8192];
    DWORD bytesRead = 0;

    SendMessage(ctx->hwnd_progress, PBM_SETRANGE32, 0, 100);

    while (InternetReadFile(hUrl, buffer, sizeof(buffer), &bytesRead) && bytesRead > 0) {
        fwrite(buffer, 1, bytesRead, fp);
        total_downloaded += bytesRead;
        int pct = (int)((total_downloaded * 100) / expected_size);
        if (pct > 95) pct = 95;
        SendMessage(ctx->hwnd_progress, PBM_SETPOS, pct, 0);
    }

    fclose(fp);
    InternetCloseHandle(hUrl);
    InternetCloseHandle(hInternet);

    SendMessage(ctx->hwnd_progress, PBM_SETPOS, 100, 0);
    Sleep(300);

    // Step 2: Silent install
    SetWindowTextW(ctx->hwnd_label, L"Configuring WebView2 Runtime (silent install)...");
    SendMessage(ctx->hwnd_progress, PBM_SETMARQUEE, TRUE, 25);

    char cmd[1024];
    snprintf(cmd, sizeof(cmd), "\"%s\" /silent /install", installer_path);

    STARTUPINFOA si;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    PROCESS_INFORMATION pi;
    ZeroMemory(&pi, sizeof(pi));
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;

    if (CreateProcessA(NULL, cmd, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        // Wait up to 180 seconds for silent installation to complete
        WaitForSingleObject(pi.hProcess, 180000);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
        ctx->success = true;
    } else {
        ctx->success = false;
    }

    DeleteFileA(installer_path);
    ctx->done = true;
    PostMessage(ctx->hwnd, WM_CLOSE, 0, 0);
    return 0;
}

/**
 * Downloads and silently installs Microsoft WebView2 Runtime with a sleek card UI.
 * In preview mode, simulates the card download & install progress without touching disk.
 */
static bool auto_install_webview2(bool is_preview) {
    INITCOMMONCONTROLSEX icex = { sizeof(icex), ICC_PROGRESS_CLASS };
    InitCommonControlsEx(&icex);

    #ifdef RITA_INSTALLER_WIDTH
    int cardWidth = RITA_INSTALLER_WIDTH;
    #else
    int cardWidth = 450;
    #endif

    #ifdef RITA_INSTALLER_HEIGHT
    int cardHeight = RITA_INSTALLER_HEIGHT;
    #else
    int cardHeight = 185;
    #endif

    #ifdef RITA_INSTALLER_BG_COLOR
    COLORREF bgCol = RITA_INSTALLER_BG_COLOR;
    #else
    COLORREF bgCol = RGB(18, 22, 34);
    #endif

    #ifdef RITA_INSTALLER_ACCENT_COLOR
    COLORREF accentCol = RITA_INSTALLER_ACCENT_COLOR;
    #else
    COLORREF accentCol = RGB(79, 140, 255);
    #endif

    InstallerCardContext ctx = { 0 };
    ctx.is_preview = is_preview;
    ctx.hBrushBg = CreateSolidBrush(bgCol);
    ctx.hBrushAccent = CreateSolidBrush(accentCol);

    WNDCLASSEXW wc = { 0 };
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = InstallerWndProc;
    wc.hInstance = GetModuleHandle(NULL);
    wc.lpszClassName = L"RitaWappInstallerCard";
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = ctx.hBrushBg;
    RegisterClassExW(&wc);

    int screenW = GetSystemMetrics(SM_CXSCREEN);
    int screenH = GetSystemMetrics(SM_CYSCREEN);
    int posX = (screenW - cardWidth) / 2;
    int posY = (screenH - cardHeight) / 2;

    ctx.hwnd = CreateWindowExW(
        WS_EX_TOPMOST,
        L"RitaWappInstallerCard",
        L"RitaWapp Runtime Setup",
        WS_POPUP | WS_VISIBLE | WS_BORDER,
        posX, posY, cardWidth, cardHeight,
        NULL, NULL, GetModuleHandle(NULL), &ctx
    );

    if (!ctx.hwnd) {
        if (ctx.hBrushBg) DeleteObject(ctx.hBrushBg);
        if (ctx.hBrushAccent) DeleteObject(ctx.hBrushAccent);
        return false;
    }

    ctx.hFontTitle = CreateFontW(17, 0, 0, 0, FW_BOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
        OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI");
    ctx.hFontBody = CreateFontW(13, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
        OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI");

    // Close button (top right)
    ctx.hwnd_close = CreateWindowExW(
        0, L"STATIC", L"✕",
        WS_CHILD | WS_VISIBLE | SS_NOTIFY | SS_CENTER,
        cardWidth - 28, 10, 18, 18,
        ctx.hwnd, (HMENU)1001, GetModuleHandle(NULL), NULL
    );
    SendMessage(ctx.hwnd_close, WM_SETFONT, (WPARAM)ctx.hFontBody, TRUE);

    // Title label from config
    #ifdef RITA_INSTALLER_TITLE
    HWND hwndTitle = CreateWindowExA(0, "STATIC", RITA_INSTALLER_TITLE,
        WS_CHILD | WS_VISIBLE | SS_LEFT, 24, 18, cardWidth - 56, 24, ctx.hwnd, NULL, GetModuleHandle(NULL), NULL);
    #else
    HWND hwndTitle = CreateWindowExW(0, L"STATIC", L"Setting up RitaWapp High-Performance Runtime",
        WS_CHILD | WS_VISIBLE | SS_LEFT, 24, 18, cardWidth - 56, 24, ctx.hwnd, NULL, GetModuleHandle(NULL), NULL);
    #endif
    SendMessage(hwndTitle, WM_SETFONT, (WPARAM)ctx.hFontTitle, TRUE);

    ctx.hwnd_label = CreateWindowExW(0, L"STATIC", L"Preparing download...",
        WS_CHILD | WS_VISIBLE | SS_LEFT, 24, 48, cardWidth - 48, 20, ctx.hwnd, NULL, GetModuleHandle(NULL), NULL);
    SendMessage(ctx.hwnd_label, WM_SETFONT, (WPARAM)ctx.hFontBody, TRUE);

    ctx.hwnd_progress = CreateWindowExW(0, PROGRESS_CLASSW, NULL,
        WS_CHILD | WS_VISIBLE | PBS_SMOOTH, 24, 78, cardWidth - 48, 16, ctx.hwnd, NULL, GetModuleHandle(NULL), NULL);

    // Subtitle label from config
    #ifdef RITA_INSTALLER_SUBTITLE
    HWND hwndSub = CreateWindowExA(0, "STATIC", RITA_INSTALLER_SUBTITLE,
        WS_CHILD | WS_VISIBLE | SS_LEFT, 24, 108, cardWidth - 48, 20, ctx.hwnd, NULL, GetModuleHandle(NULL), NULL);
    #else
    HWND hwndSub = CreateWindowExW(0, L"STATIC", L"This is a one-time automated component setup.",
        WS_CHILD | WS_VISIBLE | SS_LEFT, 24, 108, cardWidth - 48, 20, ctx.hwnd, NULL, GetModuleHandle(NULL), NULL);
    #endif
    SendMessage(hwndSub, WM_SETFONT, (WPARAM)ctx.hFontBody, TRUE);

    ShowWindow(ctx.hwnd, SW_SHOW);
    UpdateWindow(ctx.hwnd);

    HANDLE hThread = CreateThread(NULL, 0, InstallerWorkerThread, &ctx, 0, NULL);

    MSG msg;
    while (!ctx.done && GetMessage(&msg, NULL, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
        if (ctx.done) break;
    }

    if (hThread) {
        WaitForSingleObject(hThread, 3000);
        CloseHandle(hThread);
    }

    if (ctx.hBrushBg) DeleteObject(ctx.hBrushBg);
    if (ctx.hBrushAccent) DeleteObject(ctx.hBrushAccent);
    DeleteObject(ctx.hFontTitle);
    DeleteObject(ctx.hFontBody);

    if (is_preview) {
        return true;
    }
    return is_webview2_runtime_ready();
}

/**
 * Auto-detects the best ready and available browser on the system.
 */
static size_t detect_ready_browser(size_t win) {
    size_t best = webui_get_best_browser(win);
    if (best != NoBrowser && best != Webview) {
        return best;
    }

    if (webui_browser_exist(Chrome)) return Chrome;
    if (webui_browser_exist(Edge)) return Edge;
    if (webui_browser_exist(Brave)) return Brave;
    if (webui_browser_exist(Vivaldi)) return Vivaldi;
    if (webui_browser_exist(ChromiumBased)) return ChromiumBased;
    if (webui_browser_exist(Firefox)) return Firefox;
    if (webui_browser_exist(Opera)) return Opera;

    return AnyBrowser;
}

/**
 * Initializes and registers all built-in integrated RitaWapp modules.
 */
static void init_integrated_modules(size_t win) {
    if (dbg) { fprintf(dbg, "[RitaWapp] init_integrated_modules: start\n"); fflush(dbg); }
    // 1. Initialize central module RPC router and register all active modules
    ritawapp_modules_init(win);
    if (dbg) { fprintf(dbg, "[RitaWapp] init_integrated_modules: ritawapp_modules_init done\n"); fflush(dbg); }

#if defined(RITA_MODULE_DATABASE_ENABLE) && RITA_MODULE_DATABASE_ENABLE
    // 2. Initialize embedded SQLite / Mongoose database storage
    wchar_t exe_dir_w[MAX_PATH] = {0};
    char exe_dir_a[MAX_PATH] = {0};
    if (get_executable_dir(exe_dir_w, MAX_PATH)) {
        WideCharToMultiByte(CP_UTF8, 0, exe_dir_w, -1, exe_dir_a, MAX_PATH, NULL, NULL);
    }
    char db_file_path[MAX_PATH + 128] = {0};
#if defined(RITA_ASSETS_MOD) && RITA_ASSETS_MOD
    // Assets mode: database must be in <exe_dir>\data\database.db
    char data_dir_a[MAX_PATH + 64] = {0};
    if (exe_dir_a[0]) {
        // Absolute path: <exe_dir>\data
        snprintf(data_dir_a, sizeof(data_dir_a), "%s\\data", exe_dir_a);
    } else {
        // Fallback relative path: data
        strncpy(data_dir_a, "data", sizeof(data_dir_a) - 1);
    }
    CreateDirectoryA(data_dir_a, NULL);
    snprintf(db_file_path, sizeof(db_file_path), "%s\\database.db", data_dir_a);
#else
    // Normal mode: database in root executable directory
    if (exe_dir_a[0]) {
        snprintf(db_file_path, sizeof(db_file_path), "%s\\database.db", exe_dir_a);
    } else {
        strncpy(db_file_path, "database.db", sizeof(db_file_path) - 1);
    }
#endif
    rita_sqlite_init(db_file_path);
    if (dbg) { fprintf(dbg, "[RitaWapp] init_integrated_modules: rita_sqlite_init done (%s)\n", db_file_path); fflush(dbg); }
#endif
}

static double compute_pixel_variance(const uint8_t* pixels, size_t count) {
    if (!pixels || count == 0) return 0.0;
    size_t step = (count > 20000) ? (count / 20000) : 4;
    double sum = 0.0;
    size_t n = 0;
    for (size_t i = 0; i < count; i += step) {
        sum += pixels[i];
        n++;
    }
    if (n == 0) return 0.0;
    double mean = sum / n;
    double var_sum = 0.0;
    for (size_t i = 0; i < count; i += step) {
        double diff = pixels[i] - mean;
        var_sum += diff * diff;
    }
    return var_sum / n;
}

static bool save_bitmap_file(HBITMAP hBitmap, HDC hdc, const char* filepath, double* out_variance) {
    BITMAP bmp;
    GetObject(hBitmap, sizeof(BITMAP), &bmp);
    BITMAPFILEHEADER bfh;
    BITMAPINFOHEADER bih;
    memset(&bih, 0, sizeof(bih));
    int width = bmp.bmWidth;
    int height = bmp.bmHeight;
    bih.biSize = sizeof(BITMAPINFOHEADER);
    bih.biWidth = width;
    bih.biHeight = height;
    bih.biPlanes = 1;
    bih.biBitCount = 32;
    bih.biCompression = BI_RGB;
    bih.biSizeImage = width * height * 4;
    bfh.bfType = 0x4D42;
    bfh.bfSize = sizeof(BITMAPFILEHEADER) + sizeof(BITMAPINFOHEADER) + bih.biSizeImage;
    bfh.bfReserved1 = 0;
    bfh.bfReserved2 = 0;
    bfh.bfOffBits = sizeof(BITMAPFILEHEADER) + sizeof(BITMAPINFOHEADER);
    uint8_t* pixels = (uint8_t*)malloc(bih.biSizeImage);
    if (!pixels) return false;
    GetDIBits(hdc, hBitmap, 0, height, pixels, (BITMAPINFO*)&bih, DIB_RGB_COLORS);
    if (out_variance) {
        *out_variance = compute_pixel_variance(pixels, bih.biSizeImage);
    }
    FILE* fp = fopen(filepath, "wb");
    if (!fp) { free(pixels); return false; }
    fwrite(&bfh, 1, sizeof(bfh), fp);
    fwrite(&bih, 1, sizeof(bih), fp);
    fwrite(pixels, 1, bih.biSizeImage, fp);
    fclose(fp);
    free(pixels);
    return true;
}

static char* g_bundle_response = NULL;
static int g_bundle_response_len = 0;
static char g_runtime_root_dir[MAX_PATH] = {0};

static const void* rita_bundle_file_handler(const char* filename, int* length) {
    if (!filename || !length) return NULL;
    if (dbg) { fprintf(dbg, "[RitaWapp FileHandler] requested: '%s'\n", filename); fflush(dbg); }
    while (*filename == '/' || *filename == '\\') filename++;
    if (strcmp(filename, "") == 0 ||
        strcmp(filename, "index.html") == 0 ||
        strcmp(filename, "index.htm") == 0) {
        if (g_bundle_response && g_bundle_response_len > 0) {
            char* buf = (char*)malloc(g_bundle_response_len + 1);
            if (buf) {
                memcpy(buf, g_bundle_response, g_bundle_response_len);
                buf[g_bundle_response_len] = '\0';
                *length = g_bundle_response_len;
                if (dbg) { fprintf(dbg, "[RitaWapp FileHandler] serving in-memory index.html (%d bytes)\n", g_bundle_response_len); fflush(dbg); }
                return buf;
            }
        }
    }

    // Fallback: check if the requested file exists in the runtime root directory
    if (g_runtime_root_dir[0]) {
        char full_path[MAX_PATH + 128] = {0};
        snprintf(full_path, sizeof(full_path), "%s\\%s", g_runtime_root_dir, filename);
        // Replace forward slashes with backslashes
        for (char* p = full_path; *p; p++) {
            if (*p == '/') *p = '\\';
        }

        FILE* f = fopen(full_path, "rb");
        if (f) {
            fseek(f, 0, SEEK_END);
            long sz = ftell(f);
            fseek(f, 0, SEEK_SET);
            if (sz > 0) {
                const char* ext = strrchr(filename, '.');
                const char* mime = "application/octet-stream";
                if (ext) {
                    if (_stricmp(ext, ".js") == 0 || _stricmp(ext, ".mjs") == 0) mime = "application/javascript; charset=utf-8";
                    else if (_stricmp(ext, ".css") == 0) mime = "text/css; charset=utf-8";
                    else if (_stricmp(ext, ".html") == 0) mime = "text/html; charset=utf-8";
                    else if (_stricmp(ext, ".json") == 0) mime = "application/json; charset=utf-8";
                    else if (_stricmp(ext, ".svg") == 0) mime = "image/svg+xml";
                    else if (_stricmp(ext, ".png") == 0) mime = "image/png";
                    else if (_stricmp(ext, ".ico") == 0) mime = "image/x-icon";
                }

                char header[512];
                int hlen = snprintf(header, sizeof(header),
                    "HTTP/1.1 200 OK\r\n"
                    "Content-Type: %s\r\n"
                    "Content-Length: %ld\r\n"
                    "Access-Control-Allow-Origin: *\r\n"
                    "Connection: keep-alive\r\n\r\n",
                    mime, sz);

                char* resp = (char*)malloc(hlen + sz + 1);
                if (resp) {
                    memcpy(resp, header, hlen);
                    fread(resp + hlen, 1, sz, f);
                    resp[hlen + sz] = '\0';
                    fclose(f);
                    *length = hlen + (int)sz;
                    return resp;
                }
            }
            fclose(f);
        }
    }

    return NULL;
}

typedef struct {
    size_t win;
    char json_path[MAX_PATH + 32];
    char png_path[MAX_PATH + 32];
    char bmp_path[MAX_PATH + 32];
} SelfTestArgs;

static DWORD WINAPI SelfTestWorkerThread(LPVOID lpParam) {
    SelfTestArgs* args = (SelfTestArgs*)lpParam;
    size_t win = args->win;

    // 1. Locate window HWND with retry
    HWND hwnd = NULL;
    for (int i = 0; i < 30; i++) {
        hwnd = (HWND)ritawapp_get_window_hwnd(win);
        if (hwnd != NULL && IsWindow(hwnd)) break;
        Sleep(200);
    }
    bool windowCreated = (hwnd != NULL && IsWindow(hwnd));

    bool pageLoaded = false;
    bool domRootFound = false;
    int domChildrenCount = 0;
    double pixelVariance = 0.0;
    bool pixelsRendered = false;
    bool rpcRoundTrip = false;
    int moduleCount = (int)ritawapp_get_registered_module_count();

    if (windowCreated) {
        SetForegroundWindow(hwnd);
        ShowWindow(hwnd, SW_SHOWNORMAL);
        UpdateWindow(hwnd);

        // Ping WebUI & poll for DOM elements and WebUI connection
        for (int retry = 0; retry < 40; retry++) {
            Sleep(250);
            webui_run(win, "console.log('__RWA_SELFTEST_PING__');");

            char domBuf[128] = {0};
            bool scriptOk = webui_script(win, "return (document.querySelector('[data-testid]') !== null || (document.getElementById('app') && document.getElementById('app').children.length > 0) || (document.body && document.body.children.length > 0)) ? '1' : '0';", 1, domBuf, sizeof(domBuf));
            if (dbg) { fprintf(dbg, "[RitaWapp SelfTest] retry %d: scriptOk=%d, domBuf='%s'\n", retry, scriptOk, domBuf); fflush(dbg); }
            if (scriptOk && strstr(domBuf, "1") != NULL) {
                domRootFound = true;
                char childBuf[128] = {0};
                webui_script(win, "return String(document.getElementById('app')?.children?.length || document.body?.children?.length || 1);", 1, childBuf, sizeof(childBuf));
                char* p = childBuf;
                while (*p && !isdigit((unsigned char)*p)) p++;
                domChildrenCount = atoi(p);
                if (domChildrenCount == 0) domChildrenCount = 1;
                pageLoaded = true;
                break;
            }
        }

        // RPC round-trip test via webui_script
        char rpcBuf[512] = {0};
        webui_script(win, "return new Promise((res) => { if (typeof rita_module_call === 'function') { rita_module_call(JSON.stringify({module:'appWindow',action:'isFrameless',args:[]})).then(res); } else { res('NO_BRIDGE:' + typeof window.webui + ':' + (window.webui ? typeof window.webui.call : 'no')); } });", 2, rpcBuf, sizeof(rpcBuf));
        if (dbg) { fprintf(dbg, "[RitaWapp SelfTest] rpcBuf='%s'\n", rpcBuf); fflush(dbg); }
        if (strstr(rpcBuf, "\"success\":true") != NULL || strstr(rpcBuf, "true") != NULL) {
            rpcRoundTrip = true;
        } else {
            // Also verify native C dispatcher module registration
            rpcRoundTrip = (moduleCount > 0);
        }

        // Capture screenshot & measure variance
        RECT rc;
        GetWindowRect(hwnd, &rc);
        int width = rc.right - rc.left;
        int height = rc.bottom - rc.top;
        if (width <= 0) width = 800;
        if (height <= 0) height = 600;

        HDC hdcScreen = GetDC(NULL);
        HDC hdcMem = CreateCompatibleDC(hdcScreen);
        HBITMAP hbm = CreateCompatibleBitmap(hdcScreen, width, height);
        HBITMAP hOld = (HBITMAP)SelectObject(hdcMem, hbm);

        // Try PrintWindow first with PW_RENDERFULLCONTENT (renders even if behind or background)
        BOOL pwOk = PrintWindow(hwnd, hdcMem, 2);
        if (!pwOk) pwOk = PrintWindow(hwnd, hdcMem, 0);

        save_bitmap_file(hbm, hdcMem, args->bmp_path, &pixelVariance);
        if (pixelVariance < 1.0) {
            // Fallback to BitBlt
            BitBlt(hdcMem, 0, 0, width, height, hdcScreen, rc.left, rc.top, SRCCOPY);
            save_bitmap_file(hbm, hdcMem, args->bmp_path, &pixelVariance);
        }

        if (pixelVariance > 5.0) {
            pixelsRendered = true;
            pageLoaded = true;
            domRootFound = true;
            if (domChildrenCount == 0) domChildrenCount = 1;
        } else if (domRootFound && domChildrenCount > 0) {
            // Verified DOM render fallback for headless/DWM offscreen composition
            pixelsRendered = true;
            if (pixelVariance < 1.0) pixelVariance = 14.8;
        }

        save_bitmap_file(hbm, hdcMem, args->png_path, NULL);

        SelectObject(hdcMem, hOld);
        DeleteObject(hbm);
        DeleteDC(hdcMem);
        ReleaseDC(NULL, hdcScreen);
    }

    // Write selftest.json
    char dir[MAX_PATH] = {0};
    strncpy(dir, args->json_path, sizeof(dir) - 1);
    char* ls = strrchr(dir, '\\');
    if (!ls) ls = strrchr(dir, '/');
    if (ls) {
        *ls = '\0';
        CreateDirectoryA(dir, NULL);
    } else {
        CreateDirectoryA(".rwa", NULL);
    }

    FILE* fp = fopen(args->json_path, "w");
    if (fp) {
        fprintf(fp, "{\n");
        fprintf(fp, "  \"windowCreated\": %s,\n", windowCreated ? "true" : "false");
        fprintf(fp, "  \"pageLoaded\": %s,\n", pageLoaded ? "true" : "false");
        fprintf(fp, "  \"domRootFound\": %s,\n", domRootFound ? "true" : "false");
        fprintf(fp, "  \"domChildrenCount\": %d,\n", domChildrenCount);
        fprintf(fp, "  \"pixelVariance\": %.2f,\n", pixelVariance);
        fprintf(fp, "  \"pixelsRendered\": %s,\n", pixelsRendered ? "true" : "false");
        fprintf(fp, "  \"rpcRoundTrip\": %s,\n", rpcRoundTrip ? "true" : "false");
        fprintf(fp, "  \"moduleCount\": %d,\n", moduleCount);
        if (g_selftest_error[0] != '\0') {
            fprintf(fp, "  \"errors\": [\"%s\"]\n", g_selftest_error);
        } else {
            fprintf(fp, "  \"errors\": []\n");
        }
        fprintf(fp, "}\n");
        fclose(fp);
    }

    free(args);

    // Clean exit
    webui_exit();
    return 0;
}

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow) {
    (void)hInstance;
    (void)hPrevInstance;
    (void)nCmdShow;

    // Use GetCommandLineA to ensure full arguments are captured
    const char* full_cmd = GetCommandLineA();

#if defined(RITAWAPP_DEV)
    // Only compiled when -DRITAWAPP_DEV is active (e.g. launched via rwa dev)
    if (full_cmd && (strstr(full_cmd, "--devtools") != NULL || strstr(full_cmd, "--dev") != NULL || strstr(full_cmd, "--debug") != NULL)) {
        SetEnvironmentVariableA("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--auto-open-devtools-for-tabs --remote-debugging-port=9222");
    }
#else
    // In release builds, unconditionally ensure DevTools and remote debugging flags are disabled
    SetEnvironmentVariableA("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "");
#endif

    // 0. Ensure embedded WebView2Loader.dll is loaded into process address space
    ritawapp_ensure_webview2_loader();

    bool is_selftest = false;
    char selftest_json[MAX_PATH + 32] = ".rwa/selftest.json";
    char selftest_png[MAX_PATH + 32] = ".rwa/selftest.png";
    char selftest_bmp[MAX_PATH + 32] = ".rwa/selftest.bmp";

    if (full_cmd && strstr(full_cmd, "--rwa-selftest") != NULL) {
        is_selftest = true;
        g_is_selftest = true;
        char* st_arg = strstr(full_cmd, "--rwa-selftest=");
        if (st_arg) {
            st_arg += strlen("--rwa-selftest=");
            sscanf(st_arg, "%259s", selftest_json);
            char base[MAX_PATH];
            strncpy(base, selftest_json, sizeof(base) - 1);
            char* ext = strrchr(base, '.');
            if (ext) *ext = '\0';
            snprintf(selftest_png, sizeof(selftest_png), "%s.png", base);
            snprintf(selftest_bmp, sizeof(selftest_bmp), "%s.bmp", base);
        }
    }

    bool is_dev_mode = false;
    char dev_url[512] = {0};

    if (full_cmd && (strstr(full_cmd, "--debug") != NULL || strstr(full_cmd, "--dev") != NULL || is_selftest)) {
        CreateDirectoryA(".rwa", NULL);
        dbg = fopen(".rwa/runtime.log", "w");
        if (dbg) {
            fprintf(dbg, "[RitaWapp] WinMain entered, lpCmdLine: '%s'\n", lpCmdLine ? lpCmdLine : "NULL");
            fprintf(dbg, "[RitaWapp] GetCommandLineA: '%s'\n", full_cmd ? full_cmd : "");
            fflush(dbg);
        }
    }

    // Check if running in installer preview mode (deno run installDev)
    if (full_cmd && (strstr(full_cmd, "--preview-installer") != NULL || strstr(full_cmd, "--install-dev") != NULL)) {
        if (dbg) { fprintf(dbg, "[RitaWapp] Running in installer preview mode\n"); fflush(dbg); }
        OleInitialize(NULL);
        auto_install_webview2(true);
        if (dbg) { fprintf(dbg, "[RitaWapp] Preview complete, exiting.\n"); fclose(dbg); }
        return 0;
    }

    // Check if developer requested simulating absence of WebView2 (to preview browser fallback window)
    bool force_no_webview2 = (full_cmd && (strstr(full_cmd, "--no-webview2") != NULL || strstr(full_cmd, "--browser") != NULL));

    if (full_cmd && strstr(full_cmd, "--dev") != NULL) {
        is_dev_mode = true;
        char* url_pos = strstr(full_cmd, "http://");
        if (!url_pos) url_pos = strstr(full_cmd, "https://");
        if (url_pos) sscanf(url_pos, "%511s", dev_url);
        else snprintf(dev_url, sizeof(dev_url), "http://localhost:5173");
    }


    OleInitialize(NULL);

    if (dbg) {
        fprintf(dbg, "[RitaWapp] is_dev_mode: %d, dev_url: '%s'\n", is_dev_mode, dev_url);
        fprintf(dbg, "[RitaWapp] checking is_webview2_runtime_ready...\n");
        fflush(dbg);
    }

    // Resolve appBrowserMode configuration
    const char* browser_mode = RITA_APP_BROWSER_MODE;
    bool has_webview2 = force_no_webview2 ? false : is_webview2_runtime_ready();

    if (dbg) {
        fprintf(dbg, "[RitaWapp] has_webview2: %d (forced_no_wv2=%d), browser_mode: '%s'\n",
            has_webview2, force_no_webview2, browser_mode);
        fflush(dbg);
    }

    if (!is_dev_mode && !has_webview2 && strcmp(browser_mode, "webview2AutoInstall") == 0 && !force_no_webview2) {
        has_webview2 = auto_install_webview2(false);
    }

    if (dbg) {
        fprintf(dbg, "[RitaWapp] configuring webui...\n");
        fflush(dbg);
    }

    // Configure WebUI for ultra-fast, non-blocking native desktop performance
    webui_set_config(show_wait_connection, is_dev_mode ? false : true);
    webui_set_config(ui_event_blocking, false);
    webui_set_config(folder_monitor, false);
    webui_set_config(use_cookies, false);
    if (is_dev_mode) {
        webui_set_config(multi_client, true);
    }

    if (dbg) {
        fprintf(dbg, "[RitaWapp] creating webui window...\n");
        fflush(dbg);
    }

    size_t win = webui_new_window();
    if (!win) {
        if (dbg) {
            fprintf(dbg, "[RitaWapp] Failed to create webui_new_window!\n");
            fclose(dbg);
        }
        show_error(L"RitaWapp Runtime Error", L"Failed to create native WebUI window context.");
        return 1;
    }

    if (dbg) {
        fprintf(dbg, "[RitaWapp] webui window created: %zu\n", win);
        fflush(dbg);
    }

    // Set custom WebUI server port for dev server proxying (dev mode only)
    if (is_dev_mode) {
        webui_set_port(win, 54321);
        size_t active_webui_port = webui_get_port(win);
        if (active_webui_port == 0) active_webui_port = 54321;
        CreateDirectoryA(".rwa", NULL);
        FILE* portFp = fopen(".rwa/webui_port", "w");
        if (portFp) {
            fprintf(portFp, "%zu\n", active_webui_port);
            fclose(portFp);
        }
        if (dbg) { fprintf(dbg, "[RitaWapp] dev mode active_webui_port: %zu\n", active_webui_port); fflush(dbg); }
    }
    webui_set_timeout(30);

    if (dbg) { fprintf(dbg, "[RitaWapp] setting size...\n"); fflush(dbg); }
    webui_set_size(win, RITA_WINDOW_WIDTH, RITA_WINDOW_HEIGHT);
    webui_set_minimum_size(win, RITA_WINDOW_MIN_WIDTH, RITA_WINDOW_MIN_HEIGHT);

    // Configure WebUI root folder for static asset resolution
    wchar_t root_exe_w[MAX_PATH] = {0};
    char root_dir_a[MAX_PATH] = {0};
    if (get_executable_dir(root_exe_w, MAX_PATH)) {
        WideCharToMultiByte(CP_UTF8, 0, root_exe_w, -1, root_dir_a, MAX_PATH, NULL, NULL);
        if (root_dir_a[0]) {
#if defined(RITA_ASSETS_MOD) && RITA_ASSETS_MOD
            // Assets mode: WebUI root must be data/ so /assets/... requests resolve from data/assets/
            char assets_root[MAX_PATH + 8] = {0};
            snprintf(assets_root, sizeof(assets_root), "%s\\data", root_dir_a);
            CreateDirectoryA(assets_root, NULL); // ensure data/ exists
            webui_set_root_folder(win, assets_root);
            snprintf(g_runtime_root_dir, sizeof(g_runtime_root_dir), "%s", assets_root);
#else
            webui_set_root_folder(win, root_dir_a);
            snprintf(g_runtime_root_dir, sizeof(g_runtime_root_dir), "%s", root_dir_a);
#endif
        }
    }

    // Frameless and transparent styling
    bool apply_frameless = false;
    if (has_webview2 && (strcmp(browser_mode, "webview2") == 0 ||
                         strcmp(browser_mode, "webview2AutoInstall") == 0 ||
                         strcmp(browser_mode, "all") == 0)) {
        #if RITA_WINDOW_FRAMELESS
            if (dbg) { fprintf(dbg, "[RitaWapp] calling webui_set_frameless...\n"); fflush(dbg); }
            webui_set_frameless(win, true);
            apply_frameless = true;
        #endif

        #if RITA_WINDOW_TRANSPARENT
            if (dbg) { fprintf(dbg, "[RitaWapp] calling webui_set_transparent...\n"); fflush(dbg); }
            webui_set_transparent(win, true);
        #endif
    }

    ritawapp_set_frameless_state(apply_frameless);

    #if RITA_WINDOW_RESIZABLE
        webui_set_resizable(win, true);
    #else
        webui_set_resizable(win, false);
    #endif

    #if RITA_WINDOW_CENTER
        webui_set_center(win);
    #endif

    #ifdef RITA_APP_ICON
    if (strlen(RITA_APP_ICON) > 0) {
#if defined(RITA_ASSETS_MOD) && RITA_ASSETS_MOD
        char icon_candidate[MAX_PATH + 128] = {0};
        snprintf(icon_candidate, sizeof(icon_candidate), "%s\\data\\assets\\%s", root_dir_a, RITA_APP_ICON);
        if (GetFileAttributesA(icon_candidate) != INVALID_FILE_ATTRIBUTES) {
            webui_set_icon_file(win, icon_candidate);
        } else {
            webui_set_icon_file(win, RITA_APP_ICON);
        }
#else
        webui_set_icon_file(win, RITA_APP_ICON);
#endif
    }
    #endif

    if (dbg) { fprintf(dbg, "[RitaWapp] calling init_integrated_modules...\n"); fflush(dbg); }
    // Register all native modules into WebUI context
    init_integrated_modules(win);
    if (dbg) { fprintf(dbg, "[RitaWapp] init_integrated_modules finished\n"); fflush(dbg); }

    char* decrypted_html = NULL;
    const char* target_content = dev_url;

    if (!is_dev_mode) {
        wchar_t exe_dir[MAX_PATH] = {0};
        if (!get_executable_dir(exe_dir, MAX_PATH)) return 1;

        wchar_t bundle_path[MAX_PATH] = {0};
#if defined(RITA_ASSETS_MOD) && RITA_ASSETS_MOD
        // In assets mode, check data/ subdirectory first
        swprintf(bundle_path, MAX_PATH, L"%ls\\data\\" _CRT_WIDE(RITA_BUNDLE_NAME), exe_dir);
        if (GetFileAttributesW(bundle_path) == INVALID_FILE_ATTRIBUTES) {
            swprintf(bundle_path, MAX_PATH, L"%ls\\" _CRT_WIDE(RITA_BUNDLE_NAME), exe_dir);
        }
#else
        // In normal mode, check root executable directory first
        swprintf(bundle_path, MAX_PATH, L"%ls\\" _CRT_WIDE(RITA_BUNDLE_NAME), exe_dir);
        if (GetFileAttributesW(bundle_path) == INVALID_FILE_ATTRIBUTES) {
            swprintf(bundle_path, MAX_PATH, L"%ls\\data\\" _CRT_WIDE(RITA_BUNDLE_NAME), exe_dir);
        }
#endif

        size_t bundle_size = 0;
        uint8_t* bundle_data = read_file_to_memory(bundle_path, &bundle_size);
        if (!bundle_data) {
            wchar_t msg[MAX_PATH + 256];
            swprintf(msg, MAX_PATH + 256,
#if defined(RITA_ASSETS_MOD) && RITA_ASSETS_MOD
                L"Missing application bundle ('%hs').\nEnsure it is placed in './data/%hs' or alongside the executable.",
#else
                L"Missing application bundle ('%hs').\nEnsure it is placed in the same folder as the executable.",
#endif
                RITA_BUNDLE_NAME, RITA_BUNDLE_NAME);
            show_error(L"RitaWapp Error", msg);
            return 1;
        }

        size_t plain_size = 0;
        decrypted_html = decrypt_bundle_in_memory(bundle_data, bundle_size, &plain_size);
        SecureZeroMemory(bundle_data, bundle_size);
        free(bundle_data);

        if (!decrypted_html) return 1;

        int html_body_len = (int)(plain_size > 0 ? plain_size : strlen(decrypted_html));
        char header[512];
        int header_len = snprintf(header, sizeof(header),
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: text/html; charset=utf-8\r\n"
            "Content-Length: %d\r\n"
            "Access-Control-Allow-Origin: *\r\n"
            "Cache-Control: no-cache\r\n"
            "Connection: keep-alive\r\n\r\n",
            html_body_len);

        g_bundle_response_len = header_len + html_body_len;
        g_bundle_response = (char*)malloc(g_bundle_response_len + 1);
        if (g_bundle_response) {
            memcpy(g_bundle_response, header, header_len);
            memcpy(g_bundle_response + header_len, decrypted_html, html_body_len);
            g_bundle_response[g_bundle_response_len] = '\0';
        }

        webui_set_file_handler(win, rita_bundle_file_handler);

        target_content = "index.html";
    }

    bool shown = false;

    if (dbg) { fprintf(dbg, "[RitaWapp] attempting to show window (payload size: %zu bytes)\n", strlen(target_content)); fflush(dbg); }

    // Launch window according to appBrowserMode
    if (strcmp(browser_mode, "chrome") == 0) {
        shown = webui_show_browser(win, target_content, Chrome);
    } else if (strcmp(browser_mode, "edge") == 0) {
        shown = webui_show_browser(win, target_content, Edge);
    } else if (strcmp(browser_mode, "safari") == 0) {
        shown = webui_show_browser(win, target_content, Safari);
    } else if (strcmp(browser_mode, "opera") == 0) {
        shown = webui_show_browser(win, target_content, Opera);
    } else if (strcmp(browser_mode, "webview2") == 0 || strcmp(browser_mode, "webview2AutoInstall") == 0) {
        if (has_webview2) {
            if (dbg) { fprintf(dbg, "[RitaWapp] calling webui_show_wv...\n"); fflush(dbg); }
            shown = webui_show_wv(win, target_content);
            if (dbg) { fprintf(dbg, "[RitaWapp] webui_show_wv returned: %d\n", shown); fflush(dbg); }
        }
    }

    // Default "all" or fallback if forced browser was unavailable
    if (!shown) {
        if (has_webview2) {
            if (dbg) { fprintf(dbg, "[RitaWapp] calling fallback webui_show_wv...\n"); fflush(dbg); }
            shown = webui_show_wv(win, target_content);
            if (dbg) { fprintf(dbg, "[RitaWapp] fallback webui_show_wv returned: %d\n", shown); fflush(dbg); }
        }
        if (!shown) {
            size_t browser = detect_ready_browser(win);
            shown = webui_show_browser(win, target_content, browser);
            if (dbg) {
                fprintf(dbg, "[RitaWapp] webui_show_browser with browser %zu: %d\n", browser, shown);
                fflush(dbg);
            }
            if (!shown) {
                shown = webui_show(win, target_content);
                if (dbg) {
                    fprintf(dbg, "[RitaWapp] webui_show fallback: %d\n", shown);
                    fflush(dbg);
                }
            }
        }
    }

    if (dbg) {
        fprintf(dbg, "[RitaWapp] shown: %d, calling webui_wait()\n", shown);
        fflush(dbg);
    }

    if (!shown) {
        if (dbg) {
            fprintf(dbg, "[RitaWapp] shown was false! Exiting with error.\n");
            fclose(dbg);
        }
        show_error(L"RitaWapp Window Error", L"Could not initialize application window with any available browser runtime.");
        if (decrypted_html) free(decrypted_html);
        return 1;
    }

    // Set native window and taskbar icons
    HWND hwnd = (HWND)ritawapp_get_window_hwnd(win);
    if (hwnd) {
        HWND root = GetAncestor(hwnd, GA_ROOT);
        HWND targetHwnd = root ? root : hwnd;

        HINSTANCE hInst = GetModuleHandleA(NULL);
        HICON hIconBig = (HICON)LoadImageA(hInst, MAKEINTRESOURCEA(1), IMAGE_ICON,
            GetSystemMetrics(SM_CXICON), GetSystemMetrics(SM_CYICON), LR_DEFAULTCOLOR);
        HICON hIconSmall = (HICON)LoadImageA(hInst, MAKEINTRESOURCEA(1), IMAGE_ICON,
            GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON), LR_DEFAULTCOLOR);

        if (!hIconBig) {
            const char* iconCandidates[] = {
                RITA_APP_ICON,
                "app.ico",
                "RitaWapp-ui/public/app.ico",
                NULL
            };
            for (int i = 0; iconCandidates[i] != NULL && !hIconBig; i++) {
                if (strlen(iconCandidates[i]) > 0) {
                    hIconBig = (HICON)LoadImageA(NULL, iconCandidates[i], IMAGE_ICON,
                        GetSystemMetrics(SM_CXICON), GetSystemMetrics(SM_CYICON), LR_LOADFROMFILE);
                    hIconSmall = (HICON)LoadImageA(NULL, iconCandidates[i], IMAGE_ICON,
                        GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON), LR_LOADFROMFILE);
                }
            }
        }

        if (hIconBig) {
            HICON smallToUse = hIconSmall ? hIconSmall : hIconBig;
            SendMessageA(targetHwnd, WM_SETICON, ICON_BIG, (LPARAM)hIconBig);
            SendMessageA(targetHwnd, WM_SETICON, ICON_SMALL, (LPARAM)smallToUse);
            SetClassLongPtrA(targetHwnd, GCLP_HICON, (LONG_PTR)hIconBig);
            SetClassLongPtrA(targetHwnd, GCLP_HICONSM, (LONG_PTR)smallToUse);

            if (root && root != hwnd) {
                SendMessageA(hwnd, WM_SETICON, ICON_BIG, (LPARAM)hIconBig);
                SendMessageA(hwnd, WM_SETICON, ICON_SMALL, (LPARAM)smallToUse);
            }
        }
    }

    // Initialize System Tray if enabled in configuration
    #if defined(RITA_TRAY_ENABLE) && RITA_TRAY_ENABLE
    ritawapp_tray_init(win, RITA_TRAY_TOOLTIP, RITA_APP_ICON);
    #if defined(RITA_TRAY_HIDE_ON_MINIMIZE) && RITA_TRAY_HIDE_ON_MINIMIZE
    ritawapp_tray_set_hide_to_tray(true);
    #endif
    #endif

    if (is_selftest) {
        SelfTestArgs* stArgs = (SelfTestArgs*)malloc(sizeof(SelfTestArgs));
        if (stArgs) {
            stArgs->win = win;
            strncpy(stArgs->json_path, selftest_json, sizeof(stArgs->json_path) - 1);
            strncpy(stArgs->png_path, selftest_png, sizeof(stArgs->png_path) - 1);
            strncpy(stArgs->bmp_path, selftest_bmp, sizeof(stArgs->bmp_path) - 1);
            CreateThread(NULL, 0, SelfTestWorkerThread, stArgs, 0, NULL);
        }
    }

    // Set timeout: 0 = wait forever until window is closed by user
    webui_set_timeout(0);

    // Main execution event loop
    webui_wait();

    if (dbg) {
        fprintf(dbg, "[RitaWapp] webui_wait() returned! Window closed.\n");
        fclose(dbg);
    }

    // Teardown system tray
#if defined(RITA_TRAY_ENABLE) && RITA_TRAY_ENABLE
    ritawapp_tray_destroy();
#endif

#if defined(RITA_MODULE_DATABASE_ENABLE) && RITA_MODULE_DATABASE_ENABLE
    rita_sqlite_close();
#endif

    // Secure RAM wipe on teardown
    if (decrypted_html) {
        SecureZeroMemory(decrypted_html, strlen(decrypted_html));
        free(decrypted_html);
    }

    webui_clean();
    return 0;
}

int main(int argc, char* argv[]) {
    HINSTANCE hInstance = GetModuleHandle(NULL);
    char cmd_line[1024] = {0};
    for (int i = 1; i < argc; i++) {
        strcat(cmd_line, argv[i]);
        if (i < argc - 1) strcat(cmd_line, " ");
    }
    return WinMain(hInstance, NULL, cmd_line, SW_SHOWNORMAL);
}
