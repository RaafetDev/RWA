#ifndef RITAWAPP_UPDATE_MODULE_H
#define RITAWAPP_UPDATE_MODULE_H

#include <stddef.h>

void register_update_module(void);
void handle_update_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp);

#endif // RITAWAPP_UPDATE_MODULE_H
