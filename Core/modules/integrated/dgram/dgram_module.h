/**
 * ============================================================================
 * RDevCore/modules/integrated/dgram/dgram_module.h
 * ============================================================================
 * Node.js-compatible 'dgram' Module (UDP Sockets) for RitaWapp
 * ============================================================================
 */

#ifndef RITAWAPP_DGRAM_MODULE_H
#define RITAWAPP_DGRAM_MODULE_H

#include <stddef.h>

void register_dgram_module(void);
void handle_dgram_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp);

#endif // RITAWAPP_DGRAM_MODULE_H
