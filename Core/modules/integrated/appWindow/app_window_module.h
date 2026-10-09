#ifndef RITAWAPP_APP_WINDOW_MODULE_H
#define RITAWAPP_APP_WINDOW_MODULE_H

#include <stddef.h>

void register_app_window_module(void);
void handle_app_window_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp);

#endif // RITAWAPP_APP_WINDOW_MODULE_H
