#ifndef RITAWAPP_CLOUD_SYNC_MODULE_H
#define RITAWAPP_CLOUD_SYNC_MODULE_H

#include <stddef.h>

void register_cloud_sync_module(void);
void handle_cloud_sync_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp);

#endif // RITAWAPP_CLOUD_SYNC_MODULE_H
