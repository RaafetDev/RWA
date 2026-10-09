/**
 * ============================================================================
 * RDevCore/modules/integrated/admZip/adm_zip_module.h
 * ============================================================================
 * Node.js-compatible 'adm-zip' Archive Management Module for RitaWapp
 * ============================================================================
 */

#ifndef RITAWAPP_ADM_ZIP_MODULE_H
#define RITAWAPP_ADM_ZIP_MODULE_H

#include <stddef.h>

void register_adm_zip_module(void);
void handle_adm_zip_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp);

#endif // RITAWAPP_ADM_ZIP_MODULE_H
