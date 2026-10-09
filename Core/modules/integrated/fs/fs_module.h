#ifndef RITAWAPP_FS_MODULE_H
#define RITAWAPP_FS_MODULE_H

#include <stddef.h>

void register_fs_module(void);
void handle_fs_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp);

#endif // RITAWAPP_FS_MODULE_H
