/**
 * ============================================================================
 * RDevCore/runtime/native_core/webview2_loader_embed.h
 * ============================================================================
 * Embedded Microsoft Edge WebView2 Loader Header
 * ============================================================================
 */

#ifndef RITAWAPP_WEBVIEW2_LOADER_EMBED_H
#define RITAWAPP_WEBVIEW2_LOADER_EMBED_H

#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

extern const size_t RITA_WEBVIEW2_LOADER_SIZE;
extern const unsigned char RITA_WEBVIEW2_LOADER_BYTES[];

/**
 * Ensures WebView2Loader.dll is loaded into the current process address space.
 * If not present beside the executable, extracts the embedded binary into
 * %LOCALAPPDATA%\RitaWapp\bin\WebView2Loader.dll, registers that path in the
 * Win32 DLL search order via SetDllDirectoryA, and pre-loads it.
 */
bool ritawapp_ensure_webview2_loader(void);

#ifdef __cplusplus
}
#endif

#endif // RITAWAPP_WEBVIEW2_LOADER_EMBED_H
