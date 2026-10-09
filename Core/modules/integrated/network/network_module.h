#ifndef RITAWAPP_NETWORK_MODULE_H
#define RITAWAPP_NETWORK_MODULE_H

#include <stddef.h>

void register_network_module(void);
void handle_network_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp);

#endif // RITAWAPP_NETWORK_MODULE_H
