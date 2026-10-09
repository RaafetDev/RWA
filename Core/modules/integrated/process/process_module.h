#ifndef RITAWAPP_PROCESS_MODULE_H
#define RITAWAPP_PROCESS_MODULE_H

#include <stddef.h>

void register_process_module(void);
void handle_process_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp);

#endif // RITAWAPP_PROCESS_MODULE_H
