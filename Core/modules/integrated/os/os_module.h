#ifndef RITAWAPP_OS_MODULE_H
#define RITAWAPP_OS_MODULE_H

#include <stddef.h>

void register_os_module(void);
void handle_os_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp);

#endif // RITAWAPP_OS_MODULE_H
