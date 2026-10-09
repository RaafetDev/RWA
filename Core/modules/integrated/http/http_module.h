/**
 * ============================================================================
 * RDevCore/modules/integrated/http/http_module.h
 * ============================================================================
 * Node.js-compatible 'http' & 'https' Module for RitaWapp
 * ============================================================================
 */

#ifndef RITAWAPP_HTTP_MODULE_H
#define RITAWAPP_HTTP_MODULE_H

#include <stddef.h>

void register_http_module(void);
void handle_http_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp);

#endif // RITAWAPP_HTTP_MODULE_H
