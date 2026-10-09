#ifndef SAMPLE_MODULE_H
#define SAMPLE_MODULE_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

void handle_sample_module(
    size_t window,
    const char* action,
    const char* json_request,
    char* response,
    size_t max_resp
);

#ifdef __cplusplus
}
#endif

#endif // SAMPLE_MODULE_H
