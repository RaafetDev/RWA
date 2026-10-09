/**
 * ============================================================================
 * RDevCore/modules/integrated/ws/ws_module.h
 * ============================================================================
 * Node.js 'ws' WebSocket Module C Bridge powered by Cesanta Mongoose
 * ============================================================================
 */

#ifndef RITAWAPP_WS_MODULE_H
#define RITAWAPP_WS_MODULE_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

void register_ws_module(void);
void handle_ws_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp);

#ifdef __cplusplus
}
#endif

#endif // RITAWAPP_WS_MODULE_H
