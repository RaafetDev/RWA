#ifndef RITAWAPP_SHELL_MODULE_H
#define RITAWAPP_SHELL_MODULE_H

#include <stddef.h>

void register_shell_module(void);
void handle_shell_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp);

#endif // RITAWAPP_SHELL_MODULE_H
