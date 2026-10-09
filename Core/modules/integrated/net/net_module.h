/**
 * ============================================================================
 * RDevCore/modules/integrated/net/net_module.h
 * ============================================================================
 * Node.js-compatible 'net' Module (TCP Client & Server) for RitaWapp
 * ============================================================================
 */

#ifndef RITAWAPP_NET_MODULE_H
#define RITAWAPP_NET_MODULE_H

#include <stddef.h>

void register_net_module(void);
void handle_net_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp);

#endif // RITAWAPP_NET_MODULE_H
