/**
 * ============================================================================
 * RDevCore/modules/integrated/database/database_module.h
 * ============================================================================
 * Mongoose ODM & Direct SQL C Bridge to Real SQLite Storage Engine
 * High-performance, zero-blocking, WAL-mode, memory-mapped architecture
 * ============================================================================
 */

#ifndef RITAWAPP_DATABASE_MODULE_H
#define RITAWAPP_DATABASE_MODULE_H

#include <stddef.h>

void register_database_module(void);
void handle_database_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp);

#endif // RITAWAPP_DATABASE_MODULE_H
