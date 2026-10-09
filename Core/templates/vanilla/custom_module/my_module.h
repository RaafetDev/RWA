/**
 * ============================================================================
 * custom_module/my_module.h
 * ============================================================================
 * Example Custom Native C Module for RitaWapp (Vanilla JS).
 * Developers can define custom Win32, hardware, or algorithm logic here.
 * ============================================================================
 */

#ifndef CUSTOM_MY_MODULE_H
#define CUSTOM_MY_MODULE_H

#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

void handle_my_custom_module(
    size_t window,
    const char* action,
    const char* json_request,
    char* response,
    size_t max_resp
);

#ifdef __cplusplus
}
#endif

#endif // CUSTOM_MY_MODULE_H
