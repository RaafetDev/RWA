/**
 * ============================================================================
 * RDevCore/modules/integrated/database/database_module.c
 * ============================================================================
 * Mongoose ODM & Direct SQL C Bridge to Real SQLite Storage Engine
 * High-performance, zero-blocking, WAL-mode, memory-mapped architecture
 * ============================================================================
 */

#include "database_module.h"
#include "ritawapp_modules.h"
#include "rita_sqlite.h"
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void register_database_module(void) {
    rita_sqlite_init("database.db");
    ritawapp_register_module("database", handle_database_action);
}

static bool extract_balanced_json_object(const char* src, char* dst, size_t dst_max) {
    if (!src || !dst || dst_max == 0) return false;
    const char* start = strchr(src, '{');
    if (!start) return false;
    int depth = 0;
    const char* p = start;
    size_t i = 0;
    bool in_str = false;
    bool escape = false;

    while (*p && i + 1 < dst_max) {
        char ch = *p;
        if (in_str) {
            dst[i++] = ch;
            if (escape) {
                escape = false;
            } else if (ch == '\\') {
                escape = true;
            } else if (ch == '"') {
                in_str = false;
            }
        } else {
            if (ch == '"') {
                in_str = true;
                dst[i++] = ch;
            } else if (ch == '{') {
                depth++;
                dst[i++] = ch;
            } else if (ch == '}') {
                depth--;
                dst[i++] = ch;
                if (depth == 0) {
                    dst[i] = '\0';
                    return true;
                }
            } else {
                dst[i++] = ch;
            }
        }
        p++;
    }
    dst[i] = '\0';
    return (depth == 0);
}

void handle_database_action(size_t window, const char* action, const char* json_request, char* response, size_t max_resp) {
    (void)window;
    if (!action || !json_request || !response || max_resp == 0) return;

    // Direct SQL Execution
    if (strcmp(action, "sqlQuery") == 0 || strcmp(action, "query") == 0 || strcmp(action, "all") == 0) {
        char sql[4096] = {0};
        char params[4096] = {0};
        json_extract_arg(json_request, 0, sql, sizeof(sql));
        json_extract_arg(json_request, 1, params, sizeof(params));
        if (sql[0] == '\0') json_extract_string(json_request, "sql", sql, sizeof(sql));

        if (sql[0]) {
            rita_sqlite_sql_query(sql, params, response, max_resp);
            return;
        }
    }

    if (strcmp(action, "sqlRun") == 0 || strcmp(action, "run") == 0) {
        char sql[4096] = {0};
        char params[4096] = {0};
        json_extract_arg(json_request, 0, sql, sizeof(sql));
        json_extract_arg(json_request, 1, params, sizeof(params));
        if (sql[0] == '\0') json_extract_string(json_request, "sql", sql, sizeof(sql));

        if (sql[0]) {
            rita_sqlite_sql_run(sql, params, response, max_resp);
            return;
        }
    }

    if (strcmp(action, "sqlBatch") == 0 || strcmp(action, "batch") == 0) {
        const char* p = strstr(json_request, "\"args\":");
        if (p) {
            p += 7;
            while (*p == ' ' || *p == '\t') p++;
            if (*p == '[') {
                p++;
                while (*p == ' ' || *p == '\t') p++;
                if (*p == '[') {
                    rita_sqlite_sql_batch(p, response, max_resp);
                    return;
                }
            }
        }
        rita_sqlite_sql_batch(json_request, response, max_resp);
        return;
    }

    if (strcmp(action, "sqlExec") == 0 || strcmp(action, "exec") == 0) {
        char sql[8192] = {0};
        json_extract_arg(json_request, 0, sql, sizeof(sql));
        if (sql[0] == '\0') json_extract_string(json_request, "sql", sql, sizeof(sql));

        if (sql[0]) {
            rita_sqlite_sql_exec(sql, response, max_resp);
            return;
        }
    }

    // Document / Mongoose ODM Operations
    char collection[128] = {0};
    json_extract_arg(json_request, 0, collection, sizeof(collection));

    if (collection[0] == '{' || collection[0] == '\0') {
        char coll_buf[128] = {0};
        if (json_extract_string(json_request, "collection", coll_buf, sizeof(coll_buf))) {
            strncpy(collection, coll_buf, sizeof(collection) - 1);
        }
    }

    if (strcmp(action, "find") == 0) {
        char filter[4096] = {0};
        json_extract_arg(json_request, 1, filter, sizeof(filter));
        if (filter[0] == '\0') json_extract_string(json_request, "filter", filter, sizeof(filter));
        rita_sqlite_doc_find(collection, filter, response, max_resp);

    } else if (strcmp(action, "findOne") == 0) {
        char filter[4096] = {0};
        json_extract_arg(json_request, 1, filter, sizeof(filter));
        if (filter[0] == '\0') json_extract_string(json_request, "filter", filter, sizeof(filter));
        rita_sqlite_doc_find_one(collection, filter, response, max_resp);

    } else if (strcmp(action, "create") == 0 || strcmp(action, "insert") == 0 || strcmp(action, "insertOne") == 0) {
        char doc[16384] = {0};
        json_extract_arg(json_request, 1, doc, sizeof(doc));
        if (doc[0] == '\0') {
            const char* p = strstr(json_request, "\"doc\":");
            if (p) {
                p += 6;
                while (*p == ' ' || *p == '\t') p++;
                if (*p == '{') {
                    extract_balanced_json_object(p, doc, sizeof(doc));
                }
            }
        }
        rita_sqlite_doc_insert(collection, doc[0] ? doc : "{}", response, max_resp);

    } else if (strcmp(action, "updateOne") == 0 || strcmp(action, "update") == 0 || strcmp(action, "updateMany") == 0) {
        char query[4096] = {0};
        char update[16384] = {0};
        json_extract_arg(json_request, 1, query, sizeof(query));
        json_extract_arg(json_request, 2, update, sizeof(update));
        if (query[0] == '\0') json_extract_string(json_request, "filter", query, sizeof(query));
        rita_sqlite_doc_update(collection, query, update, response, max_resp);

    } else if (strcmp(action, "deleteOne") == 0 || strcmp(action, "delete") == 0 || strcmp(action, "deleteMany") == 0) {
        char query[4096] = {0};
        json_extract_arg(json_request, 1, query, sizeof(query));
        if (query[0] == '\0') json_extract_string(json_request, "filter", query, sizeof(query));
        rita_sqlite_doc_delete(collection, query, response, max_resp);

    } else if (strcmp(action, "count") == 0 || strcmp(action, "countDocuments") == 0) {
        char filter[4096] = {0};
        json_extract_arg(json_request, 1, filter, sizeof(filter));
        if (filter[0] == '\0') json_extract_string(json_request, "filter", filter, sizeof(filter));
        char raw_cnt[64] = "0";
        rita_sqlite_doc_count(collection, filter, raw_cnt, sizeof(raw_cnt));
        snprintf(response, max_resp, "{\"success\":true,\"data\":%s}", raw_cnt[0] ? raw_cnt : "0");

    } else if (strcmp(action, "connect") == 0) {
        bool ok = rita_sqlite_init("database.db");
        snprintf(response, max_resp, "{\"success\":%s,\"connected\":true}", ok ? "true" : "false");

    } else if (strcmp(action, "disconnect") == 0) {
        rita_sqlite_close();
        snprintf(response, max_resp, "{\"success\":true,\"disconnected\":true}");

    } else if (strcmp(action, "drop") == 0) {
        bool ok = rita_sqlite_doc_drop(collection);
        snprintf(response, max_resp, "{\"success\":%s}", ok ? "true" : "false");

    } else if (strcmp(action, "aiAutoIndex") == 0 || strcmp(action, "autoIndex") == 0) {
        rita_sqlite_ai_auto_index(collection, response, max_resp);

    } else if (strcmp(action, "aiSearch") == 0) {
        char query[1024] = {0};
        json_extract_arg(json_request, 1, query, sizeof(query));
        if (query[0] == '\0') json_extract_string(json_request, "query", query, sizeof(query));
        char limit_str[32] = {0};
        json_extract_arg(json_request, 2, limit_str, sizeof(limit_str));
        int limit = limit_str[0] ? atoi(limit_str) : 20;
        rita_sqlite_ai_search(collection, query, limit, response, max_resp);

    } else if (strcmp(action, "aiStoreVector") == 0) {
        char doc_id[128] = {0};
        json_extract_string(json_request, "docId", doc_id, sizeof(doc_id));
        if (doc_id[0] == '\0') json_extract_arg(json_request, 1, doc_id, sizeof(doc_id));

        float vec[2048];
        size_t dim = 0;
        const char* vp = strstr(json_request, "\"vector\":");
        if (!vp) vp = strstr(json_request, "[");
        if (vp) {
            const char* bracket = strchr(vp, '[');
            if (bracket) {
                const char* p = bracket + 1;
                while (*p && *p != ']' && dim < 2048) {
                    while (*p == ' ' || *p == ',' || *p == '\t' || *p == '\r' || *p == '\n') p++;
                    if (*p == ']' || *p == '\0') break;
                    char* end = NULL;
                    float val = (float)strtod(p, &end);
                    if (end && end != p) {
                        vec[dim++] = val;
                        p = end;
                    } else {
                        p++;
                    }
                }
            }
        }

        char metadata[2048] = "{}";
        const char* mp = strstr(json_request, "\"metadata\":");
        if (mp) {
            mp += 11;
            while (*mp == ' ' || *mp == '\t') mp++;
            if (*mp == '{') {
                if (!extract_balanced_json_object(mp, metadata, sizeof(metadata))) {
                    strncpy(metadata, "{}", sizeof(metadata) - 1);
                }
            }
        }

        rita_sqlite_ai_store_vector(collection, doc_id, vec, dim, metadata, response, max_resp);

    } else if (strcmp(action, "aiSearchVector") == 0) {
        float vec[2048];
        size_t dim = 0;
        const char* vp = strstr(json_request, "\"vector\":");
        if (!vp) vp = strstr(json_request, "[");
        if (vp) {
            const char* bracket = strchr(vp, '[');
            if (bracket) {
                const char* p = bracket + 1;
                while (*p && *p != ']' && dim < 2048) {
                    while (*p == ' ' || *p == ',' || *p == '\t' || *p == '\r' || *p == '\n') p++;
                    if (*p == ']' || *p == '\0') break;
                    char* end = NULL;
                    float val = (float)strtod(p, &end);
                    if (end && end != p) {
                        vec[dim++] = val;
                        p = end;
                    } else {
                        p++;
                    }
                }
            }
        }

        char topk_str[32] = {0};
        json_extract_string(json_request, "topK", topk_str, sizeof(topk_str));
        int top_k = topk_str[0] ? atoi(topk_str) : 10;
        if (top_k <= 0) top_k = 10;

        rita_sqlite_ai_search_vector(collection, vec, dim, top_k, response, max_resp);

    } else if (strcmp(action, "aiOptimize") == 0 || strcmp(action, "optimize") == 0) {
        rita_sqlite_ai_optimize(response, max_resp);

    } else {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Unknown db/sqlite action: '%s'\"}", action);
    }
}
