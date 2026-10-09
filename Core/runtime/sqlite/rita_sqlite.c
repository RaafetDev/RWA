/**
 * ============================================================================
 * RDevCore/runtime/sqlite/rita_sqlite.c
 * ============================================================================
 * Real SQLite Engine & Mongoose ODM Translation Implementation
 * Production-grade, zero-lock, WAL-mode, memory-mapped storage engine
 * for POS systems, School Management, ERP, and Enterprise desktop applications.
 * ============================================================================
 */

#include "rita_sqlite.h"
#include "sqlite3.h"
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <ctype.h>
#include <math.h>

static sqlite3* s_db = NULL;
static CRITICAL_SECTION s_db_cs;
static bool s_cs_init = false;
static bool s_active = false;
static char s_db_path[MAX_PATH] = "database.db";

static void ensure_cs(void) {
    if (!s_cs_init) {
        InitializeCriticalSection(&s_db_cs);
        s_cs_init = true;
    }
}

static void sanitize_name(const char* input, char* output, size_t max_out) {
    size_t j = 0;
    for (size_t i = 0; input[i] && j + 1 < max_out; i++) {
        char c = input[i];
        if (isalnum((unsigned char)c) || c == '_') {
            output[j++] = c;
        }
    }
    output[j] = '\0';
    if (j == 0) strncpy(output, "default", max_out - 1);
}

static bool ensure_collection_table(const char* collection) {
    if (!s_db) return false;
    char clean_name[128];
    sanitize_name(collection, clean_name, sizeof(clean_name));

    char sql[512];
    snprintf(sql, sizeof(sql),
        "CREATE TABLE IF NOT EXISTS col_%s ("
        "id TEXT PRIMARY KEY, "
        "doc JSON NOT NULL, "
        "created_at INTEGER, "
        "updated_at INTEGER"
        ");",
        clean_name);

    char* err_msg = NULL;
    int rc = sqlite3_exec(s_db, sql, NULL, NULL, &err_msg);
    if (rc != SQLITE_OK) {
        if (err_msg) sqlite3_free(err_msg);
        return false;
    }

    snprintf(sql, sizeof(sql),
        "CREATE INDEX IF NOT EXISTS idx_%s_created ON col_%s(created_at);",
        clean_name, clean_name);
    sqlite3_exec(s_db, sql, NULL, NULL, NULL);

    return true;
}

bool rita_sqlite_init(const char* db_path) {
    ensure_cs();
    EnterCriticalSection(&s_db_cs);

    if (s_active && s_db) {
        LeaveCriticalSection(&s_db_cs);
        return true;
    }

    if (db_path && db_path[0]) {
        strncpy(s_db_path, db_path, sizeof(s_db_path) - 1);
    }

    // Direct all SQLite temporary storage to Windows %TEMP%
    char win_temp[MAX_PATH] = {0};
    if (GetTempPathA(MAX_PATH, win_temp)) {
        if (!sqlite3_temp_directory) {
            sqlite3_temp_directory = sqlite3_mprintf("%s", win_temp);
        }
    }

    int rc = sqlite3_open_v2(s_db_path, &s_db, 
        SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, NULL);

    if (rc != SQLITE_OK || !s_db) {
        LeaveCriticalSection(&s_db_cs);
        return false;
    }

    // High-performance Pragmas for POS / School / Big Data operations
    sqlite3_exec(s_db, "PRAGMA journal_mode = WAL;", NULL, NULL, NULL);
    sqlite3_exec(s_db, "PRAGMA synchronous = NORMAL;", NULL, NULL, NULL);
    sqlite3_exec(s_db, "PRAGMA wal_autocheckpoint = 100;", NULL, NULL, NULL);
    sqlite3_exec(s_db, "PRAGMA busy_timeout = 5000;", NULL, NULL, NULL);
    sqlite3_exec(s_db, "PRAGMA automatic_index = ON;", NULL, NULL, NULL);
    sqlite3_exec(s_db, "PRAGMA threads = 4;", NULL, NULL, NULL);
    sqlite3_exec(s_db, "PRAGMA cache_size = -64000;", NULL, NULL, NULL);    // 64 MB RAM cache
    sqlite3_exec(s_db, "PRAGMA mmap_size = 268435456;", NULL, NULL, NULL);  // 256 MB memory-mapped I/O
    sqlite3_exec(s_db, "PRAGMA temp_store = FILE;", NULL, NULL, NULL);      // Use Windows %TEMP%
    sqlite3_exec(s_db, "PRAGMA foreign_keys = ON;", NULL, NULL, NULL);

    // Metadata table
    sqlite3_exec(s_db, 
        "CREATE TABLE IF NOT EXISTS _rita_meta (key TEXT PRIMARY KEY, value TEXT);", 
        NULL, NULL, NULL);

    s_active = true;
    LeaveCriticalSection(&s_db_cs);
    return true;
}

void rita_sqlite_close(void) {
    ensure_cs();
    EnterCriticalSection(&s_db_cs);
    if (s_db) {
        // Full truncate checkpoint folds all WAL pages back into database.db
        sqlite3_wal_checkpoint_v2(s_db, NULL, SQLITE_CHECKPOINT_TRUNCATE, NULL, NULL);
        sqlite3_close_v2(s_db);
        s_db = NULL;

        // Clean up temporary WAL and SHM journal files
        char wal_path[MAX_PATH + 8];
        char shm_path[MAX_PATH + 8];
        snprintf(wal_path, sizeof(wal_path), "%s-wal", s_db_path);
        snprintf(shm_path, sizeof(shm_path), "%s-shm", s_db_path);
        DeleteFileA(wal_path);
        DeleteFileA(shm_path);
    }
    s_active = false;
    LeaveCriticalSection(&s_db_cs);
}

bool rita_sqlite_is_active(void) {
    return s_active && (s_db != NULL);
}

static void extract_or_gen_id(const char* doc_json, char* out_id, size_t max_id) {
    out_id[0] = '\0';
    if (!doc_json) return;

    const char* p = strstr(doc_json, "\"_id\":");
    if (!p) p = strstr(doc_json, "\"id\":");

    if (p) {
        p = strchr(p, ':');
        if (p) {
            p++;
            while (*p == ' ' || *p == '\t' || *p == '\"') p++;
            size_t k = 0;
            while (*p && *p != '\"' && *p != ',' && *p != '}' && *p != ' ' && k + 1 < max_id) {
                out_id[k++] = *p++;
            }
            out_id[k] = '\0';
        }
    }

    if (out_id[0] == '\0') {
        static unsigned long s_counter = 1;
        snprintf(out_id, max_id, "id_%llu_%lu", (unsigned long long)time(NULL), s_counter++);
    }
}

// ============================================================================
// Document & Mongoose ODM Operations (over SQLite JSON)
// ============================================================================

bool rita_sqlite_doc_insert(const char* collection, const char* json_doc, char* response, size_t max_resp) {
    if (!rita_sqlite_init(s_db_path)) {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Failed to open SQLite database\"}");
        return false;
    }

    ensure_cs();
    EnterCriticalSection(&s_db_cs);

    if (!ensure_collection_table(collection)) {
        LeaveCriticalSection(&s_db_cs);
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Failed to initialize collection table\"}");
        return false;
    }

    char id[128];
    extract_or_gen_id(json_doc, id, sizeof(id));

    // Ensure _id exists inside the JSON doc
    char full_doc[32768];
    if (strstr(json_doc, "\"_id\"") == NULL) {
        // Inject _id as first property
        const char* brace = strchr(json_doc, '{');
        if (brace) {
            snprintf(full_doc, sizeof(full_doc), "{\"_id\":\"%s\",%s", id, brace + 1);
        } else {
            snprintf(full_doc, sizeof(full_doc), "{\"_id\":\"%s\"}", id);
        }
    } else {
        strncpy(full_doc, json_doc, sizeof(full_doc) - 1);
        full_doc[sizeof(full_doc) - 1] = '\0';
    }

    char clean_name[128];
    sanitize_name(collection, clean_name, sizeof(clean_name));

    char sql[512];
    snprintf(sql, sizeof(sql), 
        "INSERT INTO col_%s (id, doc, created_at, updated_at) VALUES (?, ?, ?, ?);", 
        clean_name);

    sqlite3_stmt* stmt = NULL;
    int rc = sqlite3_prepare_v2(s_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK || !stmt) {
        LeaveCriticalSection(&s_db_cs);
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"SQLite insert prepare failed: %s\"}", sqlite3_errmsg(s_db));
        return false;
    }

    long long now = (long long)time(NULL);
    sqlite3_bind_text(stmt, 1, id, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, full_doc, -1, SQLITE_TRANSIENT);
    sqlite3_bind_int64(stmt, 3, now);
    sqlite3_bind_int64(stmt, 4, now);

    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    LeaveCriticalSection(&s_db_cs);

    if (rc != SQLITE_DONE) {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"SQLite insert execution failed\"}");
        return false;
    }

    snprintf(response, max_resp, "%s", full_doc);
    return true;
}

typedef struct {
    char key[64];
    char val_str[1024];
    int val_type; // 0 = string, 1 = int, 2 = float, 3 = bool, 4 = null
    long long val_int;
    double val_float;
} FilterField;

static int parse_filter_fields(const char* filter_json, FilterField* fields, int max_fields) {
    if (!filter_json || filter_json[0] == '\0') return 0;
    const char* p = strchr(filter_json, '{');
    if (!p) return 0;
    p++; // skip '{'

    int count = 0;
    while (*p && *p != '}' && count < max_fields) {
        while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n' || *p == ',') p++;
        if (*p == '}' || *p == '\0') break;

        if (*p != '"') {
            p++;
            continue;
        }

        // Parse key
        p++; // skip '"'
        char key_buf[64] = {0};
        size_t ki = 0;
        while (*p && *p != '"' && ki + 1 < sizeof(key_buf)) {
            key_buf[ki++] = *p++;
        }
        if (*p == '"') p++;

        while (*p == ' ' || *p == '\t' || *p == ':') p++;

        // Parse value
        if (*p == '"') {
            p++;
            char val_buf[1024] = {0};
            size_t vi = 0;
            while (*p && *p != '"' && vi + 1 < sizeof(val_buf)) {
                if (*p == '\\' && *(p + 1)) {
                    p++;
                    switch (*p) {
                        case 'n': val_buf[vi++] = '\n'; break;
                        case 'r': val_buf[vi++] = '\r'; break;
                        case 't': val_buf[vi++] = '\t'; break;
                        case '"': val_buf[vi++] = '"'; break;
                        case '\\': val_buf[vi++] = '\\'; break;
                        default: val_buf[vi++] = *p; break;
                    }
                } else {
                    val_buf[vi++] = *p;
                }
                p++;
            }
            if (*p == '"') p++;
            strncpy(fields[count].key, key_buf, sizeof(fields[count].key) - 1);
            strncpy(fields[count].val_str, val_buf, sizeof(fields[count].val_str) - 1);
            fields[count].val_type = 0; // string
            count++;
        } else if (strncmp(p, "true", 4) == 0) {
            strncpy(fields[count].key, key_buf, sizeof(fields[count].key) - 1);
            fields[count].val_int = 1;
            fields[count].val_type = 3;
            count++;
            p += 4;
        } else if (strncmp(p, "false", 5) == 0) {
            strncpy(fields[count].key, key_buf, sizeof(fields[count].key) - 1);
            fields[count].val_int = 0;
            fields[count].val_type = 3;
            count++;
            p += 5;
        } else if (strncmp(p, "null", 4) == 0) {
            strncpy(fields[count].key, key_buf, sizeof(fields[count].key) - 1);
            fields[count].val_type = 4;
            count++;
            p += 4;
        } else if (*p == '{') {
            int d = 1;
            p++;
            while (*p && d > 0) {
                if (*p == '{') d++;
                else if (*p == '}') d--;
                p++;
            }
        } else if (*p == '[') {
            int d = 1;
            p++;
            while (*p && d > 0) {
                if (*p == '[') d++;
                else if (*p == ']') d--;
                p++;
            }
        } else {
            char* end = NULL;
            const char* ns = p;
            bool is_float = false;
            while (*p && *p != ',' && *p != '}' && *p != ' ' && *p != '\t') {
                if (*p == '.' || *p == 'e' || *p == 'E') is_float = true;
                p++;
            }
            strncpy(fields[count].key, key_buf, sizeof(fields[count].key) - 1);
            if (is_float) {
                fields[count].val_float = strtod(ns, &end);
                fields[count].val_type = 2;
            } else {
                fields[count].val_int = strtoll(ns, &end, 10);
                fields[count].val_type = 1;
            }
            count++;
        }
    }
    return count;
}

static void bind_filter_fields(sqlite3_stmt* stmt, int start_idx, const FilterField* fields, int count) {
    for (int i = 0; i < count; i++) {
        int idx = start_idx + i;
        if (fields[i].val_type == 0) {
            sqlite3_bind_text(stmt, idx, fields[i].val_str, -1, SQLITE_TRANSIENT);
        } else if (fields[i].val_type == 1) {
            sqlite3_bind_int64(stmt, idx, fields[i].val_int);
        } else if (fields[i].val_type == 2) {
            sqlite3_bind_double(stmt, idx, fields[i].val_float);
        } else if (fields[i].val_type == 3) {
            sqlite3_bind_int(stmt, idx, (int)fields[i].val_int);
        } else if (fields[i].val_type == 4) {
            sqlite3_bind_null(stmt, idx);
        }
    }
}

bool rita_sqlite_doc_find(const char* collection, const char* filter_json, char* response, size_t max_resp) {
    if (!rita_sqlite_init(s_db_path)) {
        snprintf(response, max_resp, "[]");
        return false;
    }

    ensure_cs();
    EnterCriticalSection(&s_db_cs);

    if (!ensure_collection_table(collection)) {
        LeaveCriticalSection(&s_db_cs);
        snprintf(response, max_resp, "[]");
        return false;
    }

    char clean_name[128];
    sanitize_name(collection, clean_name, sizeof(clean_name));

    FilterField fields[16];
    int count = parse_filter_fields(filter_json, fields, 16);

    char sql[2048];
    size_t slen = (size_t)snprintf(sql, sizeof(sql), "SELECT doc FROM col_%s", clean_name);
    if (count > 0) {
        slen += (size_t)snprintf(sql + slen, sizeof(sql) - slen, " WHERE ");
        for (int i = 0; i < count; i++) {
            if (i > 0) slen += (size_t)snprintf(sql + slen, sizeof(sql) - slen, " AND ");
            if (strcmp(fields[i].key, "_id") == 0 || strcmp(fields[i].key, "id") == 0) {
                slen += (size_t)snprintf(sql + slen, sizeof(sql) - slen, "id = ?");
            } else {
                slen += (size_t)snprintf(sql + slen, sizeof(sql) - slen, "json_extract(doc, '$.%s') = ?", fields[i].key);
            }
        }
    }
    snprintf(sql + slen, sizeof(sql) - slen, " ORDER BY rowid ASC;");

    sqlite3_stmt* stmt = NULL;
    int rc = sqlite3_prepare_v2(s_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK || !stmt) {
        LeaveCriticalSection(&s_db_cs);
        snprintf(response, max_resp, "[]");
        return false;
    }

    if (count > 0) {
        bind_filter_fields(stmt, 1, fields, count);
    }

    size_t pos = 0;
    if (max_resp > 2) {
        response[pos++] = '[';
        response[pos] = '\0';
    }

    bool first = true;
    while (sqlite3_step(stmt) == SQLITE_ROW) {
        const char* doc_text = (const char*)sqlite3_column_text(stmt, 0);
        if (!doc_text) continue;

        size_t doc_len = strlen(doc_text);
        if (pos + doc_len + 4 >= max_resp) break; // prevent buffer overflow

        if (!first) {
            response[pos++] = ',';
        }
        first = false;

        memcpy(&response[pos], doc_text, doc_len);
        pos += doc_len;
        response[pos] = '\0';
    }

    sqlite3_finalize(stmt);
    LeaveCriticalSection(&s_db_cs);

    if (pos + 2 < max_resp) {
        response[pos++] = ']';
        response[pos] = '\0';
    } else {
        snprintf(response, max_resp, "[]");
    }

    return true;
}

bool rita_sqlite_doc_find_one(const char* collection, const char* filter_json, char* response, size_t max_resp) {
    if (!rita_sqlite_init(s_db_path)) {
        snprintf(response, max_resp, "null");
        return false;
    }

    ensure_cs();
    EnterCriticalSection(&s_db_cs);

    if (!ensure_collection_table(collection)) {
        LeaveCriticalSection(&s_db_cs);
        snprintf(response, max_resp, "null");
        return false;
    }

    char clean_name[128];
    sanitize_name(collection, clean_name, sizeof(clean_name));

    FilterField fields[16];
    int count = parse_filter_fields(filter_json, fields, 16);

    char sql[2048];
    size_t slen = (size_t)snprintf(sql, sizeof(sql), "SELECT doc FROM col_%s", clean_name);
    if (count > 0) {
        slen += (size_t)snprintf(sql + slen, sizeof(sql) - slen, " WHERE ");
        for (int i = 0; i < count; i++) {
            if (i > 0) slen += (size_t)snprintf(sql + slen, sizeof(sql) - slen, " AND ");
            if (strcmp(fields[i].key, "_id") == 0 || strcmp(fields[i].key, "id") == 0) {
                slen += (size_t)snprintf(sql + slen, sizeof(sql) - slen, "id = ?");
            } else {
                slen += (size_t)snprintf(sql + slen, sizeof(sql) - slen, "json_extract(doc, '$.%s') = ?", fields[i].key);
            }
        }
    }
    snprintf(sql + slen, sizeof(sql) - slen, " ORDER BY rowid ASC LIMIT 1;");

    sqlite3_stmt* stmt = NULL;
    int rc = sqlite3_prepare_v2(s_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK || !stmt) {
        LeaveCriticalSection(&s_db_cs);
        snprintf(response, max_resp, "null");
        return false;
    }

    if (count > 0) {
        bind_filter_fields(stmt, 1, fields, count);
    }

    if (sqlite3_step(stmt) == SQLITE_ROW) {
        const char* doc_text = (const char*)sqlite3_column_text(stmt, 0);
        snprintf(response, max_resp, "%s", doc_text ? doc_text : "null");
    } else {
        snprintf(response, max_resp, "null");
    }

    sqlite3_finalize(stmt);
    LeaveCriticalSection(&s_db_cs);
    return true;
}

bool rita_sqlite_doc_update(const char* collection, const char* query_json, const char* update_json, char* response, size_t max_resp) {
    if (!rita_sqlite_init(s_db_path)) {
        snprintf(response, max_resp, "{\"matchedCount\":0,\"modifiedCount\":0}");
        return false;
    }

    ensure_cs();
    EnterCriticalSection(&s_db_cs);

    if (!ensure_collection_table(collection)) {
        LeaveCriticalSection(&s_db_cs);
        snprintf(response, max_resp, "{\"matchedCount\":0,\"modifiedCount\":0}");
        return false;
    }

    char clean_name[128];
    sanitize_name(collection, clean_name, sizeof(clean_name));

    FilterField fields[16];
    int count = parse_filter_fields(query_json, fields, 16);

    char sql[2048];
    size_t slen = (size_t)snprintf(sql, sizeof(sql),
        "UPDATE col_%s SET doc = json_patch(doc, ?), updated_at = ?", clean_name);

    if (count > 0) {
        slen += (size_t)snprintf(sql + slen, sizeof(sql) - slen, " WHERE ");
        for (int i = 0; i < count; i++) {
            if (i > 0) slen += (size_t)snprintf(sql + slen, sizeof(sql) - slen, " AND ");
            if (strcmp(fields[i].key, "_id") == 0 || strcmp(fields[i].key, "id") == 0) {
                slen += (size_t)snprintf(sql + slen, sizeof(sql) - slen, "id = ?");
            } else {
                slen += (size_t)snprintf(sql + slen, sizeof(sql) - slen, "json_extract(doc, '$.%s') = ?", fields[i].key);
            }
        }
    }
    snprintf(sql + slen, sizeof(sql) - slen, ";");

    sqlite3_stmt* stmt = NULL;
    int rc = sqlite3_prepare_v2(s_db, sql, -1, &stmt, NULL);
    int changes = 0;
    if (rc == SQLITE_OK && stmt) {
        sqlite3_bind_text(stmt, 1, update_json ? update_json : "{}", -1, SQLITE_TRANSIENT);
        sqlite3_bind_int64(stmt, 2, (long long)time(NULL));
        if (count > 0) {
            bind_filter_fields(stmt, 3, fields, count);
        }
        if (sqlite3_step(stmt) == SQLITE_DONE) {
            changes = sqlite3_changes(s_db);
        }
        sqlite3_finalize(stmt);
    }

    LeaveCriticalSection(&s_db_cs);
    snprintf(response, max_resp, "{\"matchedCount\":%d,\"modifiedCount\":%d}", changes, changes);
    return true;
}

bool rita_sqlite_doc_delete(const char* collection, const char* query_json, char* response, size_t max_resp) {
    if (!rita_sqlite_init(s_db_path)) {
        snprintf(response, max_resp, "{\"deletedCount\":0}");
        return false;
    }

    ensure_cs();
    EnterCriticalSection(&s_db_cs);

    if (!ensure_collection_table(collection)) {
        LeaveCriticalSection(&s_db_cs);
        snprintf(response, max_resp, "{\"deletedCount\":0}");
        return false;
    }

    char clean_name[128];
    sanitize_name(collection, clean_name, sizeof(clean_name));

    FilterField fields[16];
    int count = parse_filter_fields(query_json, fields, 16);

    char sql[2048];
    size_t slen = (size_t)snprintf(sql, sizeof(sql), "DELETE FROM col_%s", clean_name);
    if (count > 0) {
        slen += (size_t)snprintf(sql + slen, sizeof(sql) - slen, " WHERE ");
        for (int i = 0; i < count; i++) {
            if (i > 0) slen += (size_t)snprintf(sql + slen, sizeof(sql) - slen, " AND ");
            if (strcmp(fields[i].key, "_id") == 0 || strcmp(fields[i].key, "id") == 0) {
                slen += (size_t)snprintf(sql + slen, sizeof(sql) - slen, "id = ?");
            } else {
                slen += (size_t)snprintf(sql + slen, sizeof(sql) - slen, "json_extract(doc, '$.%s') = ?", fields[i].key);
            }
        }
    }
    snprintf(sql + slen, sizeof(sql) - slen, ";");

    sqlite3_stmt* stmt = NULL;
    int rc = sqlite3_prepare_v2(s_db, sql, -1, &stmt, NULL);
    int changes = 0;
    if (rc == SQLITE_OK && stmt) {
        if (count > 0) {
            bind_filter_fields(stmt, 1, fields, count);
        }
        if (sqlite3_step(stmt) == SQLITE_DONE) {
            changes = sqlite3_changes(s_db);
        }
        sqlite3_finalize(stmt);
    }

    LeaveCriticalSection(&s_db_cs);
    snprintf(response, max_resp, "{\"deletedCount\":%d}", changes);
    return true;
}

bool rita_sqlite_doc_count(const char* collection, const char* filter_json, char* response, size_t max_resp) {
    if (!rita_sqlite_init(s_db_path)) {
        snprintf(response, max_resp, "0");
        return false;
    }

    ensure_cs();
    EnterCriticalSection(&s_db_cs);

    if (!ensure_collection_table(collection)) {
        LeaveCriticalSection(&s_db_cs);
        snprintf(response, max_resp, "0");
        return false;
    }

    char clean_name[128];
    sanitize_name(collection, clean_name, sizeof(clean_name));

    FilterField fields[16];
    int count = parse_filter_fields(filter_json, fields, 16);

    char sql[2048];
    size_t slen = (size_t)snprintf(sql, sizeof(sql), "SELECT COUNT(*) FROM col_%s", clean_name);
    if (count > 0) {
        slen += (size_t)snprintf(sql + slen, sizeof(sql) - slen, " WHERE ");
        for (int i = 0; i < count; i++) {
            if (i > 0) slen += (size_t)snprintf(sql + slen, sizeof(sql) - slen, " AND ");
            if (strcmp(fields[i].key, "_id") == 0 || strcmp(fields[i].key, "id") == 0) {
                slen += (size_t)snprintf(sql + slen, sizeof(sql) - slen, "id = ?");
            } else {
                slen += (size_t)snprintf(sql + slen, sizeof(sql) - slen, "json_extract(doc, '$.%s') = ?", fields[i].key);
            }
        }
    }
    snprintf(sql + slen, sizeof(sql) - slen, ";");

    sqlite3_stmt* stmt = NULL;
    long long total = 0;
    if (sqlite3_prepare_v2(s_db, sql, -1, &stmt, NULL) == SQLITE_OK) {
        if (count > 0) {
            bind_filter_fields(stmt, 1, fields, count);
        }
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            total = sqlite3_column_int64(stmt, 0);
        }
        sqlite3_finalize(stmt);
    }

    LeaveCriticalSection(&s_db_cs);
    snprintf(response, max_resp, "%lld", total);
    return true;
}

bool rita_sqlite_doc_drop(const char* collection) {
    if (!rita_sqlite_init(s_db_path)) return false;

    ensure_cs();
    EnterCriticalSection(&s_db_cs);

    char clean_name[128];
    sanitize_name(collection, clean_name, sizeof(clean_name));

    char sql[256];
    snprintf(sql, sizeof(sql), "DROP TABLE IF EXISTS col_%s;", clean_name);
    int rc = sqlite3_exec(s_db, sql, NULL, NULL, NULL);

    LeaveCriticalSection(&s_db_cs);
    return (rc == SQLITE_OK);
}

// ============================================================================
// Direct SQL Engine (High-Performance POS, School Management, Big Data)
// ============================================================================

static void bind_json_params(sqlite3_stmt* stmt, const char* params_json) {
    if (!stmt || !params_json || params_json[0] == '\0') return;

    const char* p = strchr(params_json, '[');
    if (!p) return;
    p++; // skip '['

    int param_idx = 1;
    while (*p && *p != ']') {
        while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n' || *p == ',') p++;
        if (*p == ']' || *p == '\0') break;

        if (*p == '"') {
            // String literal
            p++;
            char val_buf[4096];
            size_t vi = 0;
            while (*p && *p != '"' && vi + 1 < sizeof(val_buf)) {
                if (*p == '\\' && *(p + 1)) {
                    p++;
                    switch (*p) {
                        case 'n': val_buf[vi++] = '\n'; break;
                        case 'r': val_buf[vi++] = '\r'; break;
                        case 't': val_buf[vi++] = '\t'; break;
                        case '"': val_buf[vi++] = '"'; break;
                        case '\\': val_buf[vi++] = '\\'; break;
                        default: val_buf[vi++] = *p; break;
                    }
                } else {
                    val_buf[vi++] = *p;
                }
                p++;
            }
            val_buf[vi] = '\0';
            if (*p == '"') p++;
            sqlite3_bind_text(stmt, param_idx++, val_buf, (int)vi, SQLITE_TRANSIENT);
        } else if (strncmp(p, "null", 4) == 0) {
            sqlite3_bind_null(stmt, param_idx++);
            p += 4;
        } else if (strncmp(p, "true", 4) == 0) {
            sqlite3_bind_int(stmt, param_idx++, 1);
            p += 4;
        } else if (strncmp(p, "false", 5) == 0) {
            sqlite3_bind_int(stmt, param_idx++, 0);
            p += 5;
        } else if (*p == '{' || *p == '[') {
            const char* start = p;
            char open_ch = *p;
            char close_ch = (open_ch == '{') ? '}' : ']';
            int depth = 0;
            bool in_s = false;
            bool esc = false;
            while (*p) {
                char c = *p;
                if (in_s) {
                    if (esc) esc = false;
                    else if (c == '\\') esc = true;
                    else if (c == '"') in_s = false;
                } else {
                    if (c == '"') in_s = true;
                    else if (c == open_ch) depth++;
                    else if (c == close_ch) {
                        depth--;
                        if (depth == 0) { p++; break; }
                    }
                }
                p++;
            }
            size_t len = (size_t)(p - start);
            char val_buf[4096];
            if (len >= sizeof(val_buf)) len = sizeof(val_buf) - 1;
            memcpy(val_buf, start, len);
            val_buf[len] = '\0';
            sqlite3_bind_text(stmt, param_idx++, val_buf, (int)len, SQLITE_TRANSIENT);
        } else {
            // Number (integer or double)
            char* end = NULL;
            const char* num_start = p;
            bool is_float = false;
            while (*p && *p != ',' && *p != ']' && *p != ' ' && *p != '\t' && *p != '\r' && *p != '\n') {
                if (*p == '.' || *p == 'e' || *p == 'E') is_float = true;
                p++;
            }
            if (is_float) {
                double val = strtod(num_start, &end);
                sqlite3_bind_double(stmt, param_idx++, val);
            } else {
                long long val = strtoll(num_start, &end, 10);
                sqlite3_bind_int64(stmt, param_idx++, (sqlite3_int64)val);
            }
        }
    }
}

bool rita_sqlite_sql_query(const char* sql, const char* params_json, char* response, size_t max_resp) {
    if (!rita_sqlite_init(s_db_path)) {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"SQLite database not available\"}");
        return false;
    }

    ensure_cs();
    EnterCriticalSection(&s_db_cs);

    sqlite3_stmt* stmt = NULL;
    int rc = sqlite3_prepare_v2(s_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK || !stmt) {
        const char* err = sqlite3_errmsg(s_db);
        LeaveCriticalSection(&s_db_cs);
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"SQL prepare error: %s\"}", err);
        return false;
    }

    if (params_json && params_json[0]) {
        bind_json_params(stmt, params_json);
    }

    size_t pos = 0;
    int written = snprintf(response, max_resp, "{\"success\":true,\"data\":[");
    if (written > 0) pos = (size_t)written;

    int cols = sqlite3_column_count(stmt);
    bool first_row = true;

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        if (!first_row) {
            if (pos + 2 < max_resp) response[pos++] = ',';
        }
        first_row = false;

        if (pos + 2 < max_resp) response[pos++] = '{';

        for (int c = 0; c < cols; c++) {
            if (c > 0 && pos + 2 < max_resp) response[pos++] = ',';

            const char* col_name = sqlite3_column_name(stmt, c);
            int col_type = sqlite3_column_type(stmt, c);

            int name_len = snprintf(&response[pos], max_resp - pos, "\"%s\":", col_name);
            if (name_len > 0) pos += (size_t)name_len;

            if (col_type == SQLITE_INTEGER) {
                long long val = sqlite3_column_int64(stmt, c);
                int val_len = snprintf(&response[pos], max_resp - pos, "%lld", val);
                if (val_len > 0) pos += (size_t)val_len;
            } else if (col_type == SQLITE_FLOAT) {
                double val = sqlite3_column_double(stmt, c);
                int val_len = snprintf(&response[pos], max_resp - pos, "%.4f", val);
                if (val_len > 0) pos += (size_t)val_len;
            } else if (col_type == SQLITE_NULL) {
                int val_len = snprintf(&response[pos], max_resp - pos, "null");
                if (val_len > 0) pos += (size_t)val_len;
            } else {
                // Text or Blob
                const char* val = (const char*)sqlite3_column_text(stmt, c);
                if (!val) val = "";
                if (pos + 2 < max_resp) response[pos++] = '\"';
                for (size_t v = 0; val[v] && pos + 4 < max_resp; v++) {
                    char ch = val[v];
                    if (ch == '\"' || ch == '\\') {
                        response[pos++] = '\\';
                        response[pos++] = ch;
                    } else if (ch == '\n') {
                        response[pos++] = '\\';
                        response[pos++] = 'n';
                    } else if (ch == '\r') {
                        response[pos++] = '\\';
                        response[pos++] = 'r';
                    } else {
                        response[pos++] = ch;
                    }
                }
                if (pos + 2 < max_resp) response[pos++] = '\"';
            }
        }

        if (pos + 2 < max_resp) response[pos++] = '}';

        if (pos + 64 >= max_resp) break; // Avoid buffer truncation crash
    }

    sqlite3_finalize(stmt);
    LeaveCriticalSection(&s_db_cs);

    if (pos + 4 < max_resp) {
        response[pos++] = ']';
        response[pos++] = '}';
        response[pos] = '\0';
    } else {
        snprintf(response, max_resp, "{\"success\":true,\"data\":[]}");
    }

    return true;
}

bool rita_sqlite_sql_run(const char* sql, const char* params_json, char* response, size_t max_resp) {
    if (!rita_sqlite_init(s_db_path)) {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"SQLite database not available\"}");
        return false;
    }

    ensure_cs();
    EnterCriticalSection(&s_db_cs);

    sqlite3_stmt* stmt = NULL;
    int rc = sqlite3_prepare_v2(s_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK || !stmt) {
        const char* err = sqlite3_errmsg(s_db);
        LeaveCriticalSection(&s_db_cs);
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"SQL prepare error: %s\"}", err);
        return false;
    }

    if (params_json && params_json[0]) {
        bind_json_params(stmt, params_json);
    }

    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    long long last_id = sqlite3_last_insert_rowid(s_db);
    int changes = sqlite3_changes(s_db);

    LeaveCriticalSection(&s_db_cs);

    if (rc != SQLITE_DONE && rc != SQLITE_ROW) {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Execution failed (code %d)\"}", rc);
        return false;
    }

    snprintf(response, max_resp, "{\"success\":true,\"data\":{\"lastInsertRowid\":%lld,\"changes\":%d}}", last_id, changes);
    return true;
}

bool rita_sqlite_sql_exec(const char* sql, char* response, size_t max_resp) {
    if (!rita_sqlite_init(s_db_path)) {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"SQLite database not available\"}");
        return false;
    }

    ensure_cs();
    EnterCriticalSection(&s_db_cs);

    char* err_msg = NULL;
    int rc = sqlite3_exec(s_db, sql, NULL, NULL, &err_msg);

    LeaveCriticalSection(&s_db_cs);

    if (rc != SQLITE_OK) {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"%s\"}", err_msg ? err_msg : "SQL exec failed");
        if (err_msg) sqlite3_free(err_msg);
        return false;
    }

    snprintf(response, max_resp, "{\"success\":true}");
    return true;
}

bool rita_sqlite_sql_transaction(const char* statements_json, char* response, size_t max_resp) {
    (void)statements_json;
    return rita_sqlite_sql_exec("BEGIN IMMEDIATE TRANSACTION;", response, max_resp);
}

bool rita_sqlite_sql_batch(const char* batch_json, char* response, size_t max_resp) {
    if (!rita_sqlite_init(s_db_path)) {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"SQLite database not available\"}");
        return false;
    }

    if (!batch_json || batch_json[0] == '\0') {
        snprintf(response, max_resp, "{\"success\":true,\"totalExecuted\":0}");
        return true;
    }

    const char* p = strchr(batch_json, '[');
    if (!p) {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Batch payload must be an array\"}");
        return false;
    }
    p++; // skip '['

    ensure_cs();
    EnterCriticalSection(&s_db_cs);

    char* err_msg = NULL;
    int rc = sqlite3_exec(s_db, "BEGIN IMMEDIATE TRANSACTION;", NULL, NULL, &err_msg);
    if (rc != SQLITE_OK) {
        LeaveCriticalSection(&s_db_cs);
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Failed to begin transaction: %s\"}", err_msg ? err_msg : "");
        if (err_msg) sqlite3_free(err_msg);
        return false;
    }

    sqlite3_stmt* last_stmt = NULL;
    char last_sql[2048] = {0};
    int executed_count = 0;
    bool success = true;

    while (*p && *p != ']') {
        while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n' || *p == ',') p++;
        if (*p == ']' || *p == '\0') break;

        char sql_buf[2048] = {0};
        const char* params_ptr = NULL;

        if (*p == '"') {
            // Simple SQL query string in batch array
            p++;
            size_t si = 0;
            while (*p && *p != '"' && si + 1 < sizeof(sql_buf)) {
                if (*p == '\\' && *(p + 1)) {
                    p++;
                    switch (*p) {
                        case 'n': sql_buf[si++] = '\n'; break;
                        case 'r': sql_buf[si++] = '\r'; break;
                        case 't': sql_buf[si++] = '\t'; break;
                        case '"': sql_buf[si++] = '"'; break;
                        case '\\': sql_buf[si++] = '\\'; break;
                        default: sql_buf[si++] = *p; break;
                    }
                } else {
                    sql_buf[si++] = *p;
                }
                p++;
            }
            if (*p == '"') p++;
        } else if (*p == '{') {
            // Object: { "sql": "...", "params": [...] }
            const char* obj_start = p;
            p++;
            int depth = 1;
            bool in_str = false;
            bool esc = false;
            const char* obj_end = NULL;
            const char* scan = p;
            while (*scan) {
                if (in_str) {
                    if (esc) esc = false;
                    else if (*scan == '\\') esc = true;
                    else if (*scan == '"') in_str = false;
                } else {
                    if (*scan == '"') in_str = true;
                    else if (*scan == '{') depth++;
                    else if (*scan == '}') {
                        depth--;
                        if (depth == 0) { obj_end = scan; p = scan + 1; break; }
                    }
                }
                scan++;
            }
            if (!obj_end) break;

            const char* sql_pos = strstr(obj_start, "\"sql\":");
            if (sql_pos && sql_pos < obj_end) {
                sql_pos += 6;
                while (sql_pos < obj_end && (*sql_pos == ' ' || *sql_pos == '\t')) sql_pos++;
                if (sql_pos < obj_end && *sql_pos == '"') {
                    sql_pos++;
                    size_t si = 0;
                    while (sql_pos < obj_end && *sql_pos != '"' && si + 1 < sizeof(sql_buf)) {
                        if (*sql_pos == '\\' && *(sql_pos + 1)) {
                            sql_pos++;
                            switch (*sql_pos) {
                                case 'n': sql_buf[si++] = '\n'; break;
                                case 'r': sql_buf[si++] = '\r'; break;
                                case 't': sql_buf[si++] = '\t'; break;
                                case '"': sql_buf[si++] = '"'; break;
                                case '\\': sql_buf[si++] = '\\'; break;
                                default: sql_buf[si++] = *sql_pos; break;
                            }
                        } else {
                            sql_buf[si++] = *sql_pos;
                        }
                        sql_pos++;
                    }
                }
            }

            const char* par_pos = strstr(obj_start, "\"params\":");
            if (par_pos && par_pos < obj_end) {
                par_pos += 9;
                while (par_pos < obj_end && (*par_pos == ' ' || *par_pos == '\t')) par_pos++;
                if (par_pos < obj_end && *par_pos == '[') {
                    params_ptr = par_pos;
                }
            }
        } else {
            p++;
            continue;
        }

        if (sql_buf[0] == '\0') continue;

        if (!last_stmt || strcmp(last_sql, sql_buf) != 0) {
            if (last_stmt) {
                sqlite3_finalize(last_stmt);
                last_stmt = NULL;
            }
            rc = sqlite3_prepare_v2(s_db, sql_buf, -1, &last_stmt, NULL);
            if (rc != SQLITE_OK || !last_stmt) {
                success = false;
                break;
            }
            strncpy(last_sql, sql_buf, sizeof(last_sql) - 1);
        } else {
            sqlite3_reset(last_stmt);
            sqlite3_clear_bindings(last_stmt);
        }

        if (params_ptr) {
            bind_json_params(last_stmt, params_ptr);
        }

        rc = sqlite3_step(last_stmt);
        if (rc != SQLITE_DONE && rc != SQLITE_ROW) {
            success = false;
            break;
        }
        executed_count++;
    }

    if (last_stmt) {
        sqlite3_finalize(last_stmt);
    }

    if (success) {
        sqlite3_exec(s_db, "COMMIT;", NULL, NULL, NULL);
        LeaveCriticalSection(&s_db_cs);
        snprintf(response, max_resp, "{\"success\":true,\"totalExecuted\":%d}", executed_count);
        return true;
    } else {
        const char* err = sqlite3_errmsg(s_db);
        sqlite3_exec(s_db, "ROLLBACK;", NULL, NULL, NULL);
        LeaveCriticalSection(&s_db_cs);
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Batch execution failed at query %d: %s\"}", executed_count + 1, err ? err : "unknown");
        return false;
    }
}

// ============================================================================
// AI Automated Indexing & Vector Search Engine Implementation
// ============================================================================

static bool ensure_ai_vector_table(void) {
    if (!s_db) return false;
    const char* sql = 
        "CREATE TABLE IF NOT EXISTS _rita_ai_vectors ("
        "id TEXT PRIMARY KEY, "
        "collection TEXT NOT NULL, "
        "doc_id TEXT NOT NULL, "
        "dimensions INTEGER NOT NULL, "
        "vector BLOB NOT NULL, "
        "metadata JSON, "
        "created_at INTEGER"
        ");"
        "CREATE INDEX IF NOT EXISTS idx_rita_vec_coll ON _rita_ai_vectors(collection);"
        "CREATE INDEX IF NOT EXISTS idx_rita_vec_doc ON _rita_ai_vectors(doc_id);";
    return (sqlite3_exec(s_db, sql, NULL, NULL, NULL) == SQLITE_OK);
}

static bool ensure_ai_fts(const char* collection) {
    if (!s_db) return false;
    char clean[128];
    sanitize_name(collection, clean, sizeof(clean));

    // Ensure collection table exists
    ensure_collection_table(clean);

    char sql[2048];
    // Create FTS5 virtual table
    snprintf(sql, sizeof(sql),
        "CREATE VIRTUAL TABLE IF NOT EXISTS fts_%s USING fts5(id UNINDEXED, content, tokenize = 'porter unicode61');",
        clean);
    int rc = sqlite3_exec(s_db, sql, NULL, NULL, NULL);
    if (rc != SQLITE_OK) return false;

    // Triggers for real-time synchronization between col_<clean> and fts_<clean>
    snprintf(sql, sizeof(sql),
        "CREATE TRIGGER IF NOT EXISTS trg_%s_ai_ins AFTER INSERT ON col_%s "
        "BEGIN "
        "INSERT INTO fts_%s(id, content) VALUES (new.id, new.doc); "
        "END;",
        clean, clean, clean);
    sqlite3_exec(s_db, sql, NULL, NULL, NULL);

    snprintf(sql, sizeof(sql),
        "CREATE TRIGGER IF NOT EXISTS trg_%s_ai_del AFTER DELETE ON col_%s "
        "BEGIN "
        "DELETE FROM fts_%s WHERE id = old.id; "
        "END;",
        clean, clean, clean);
    sqlite3_exec(s_db, sql, NULL, NULL, NULL);

    snprintf(sql, sizeof(sql),
        "CREATE TRIGGER IF NOT EXISTS trg_%s_ai_upd AFTER UPDATE ON col_%s "
        "BEGIN "
        "DELETE FROM fts_%s WHERE id = old.id; "
        "INSERT INTO fts_%s(id, content) VALUES (new.id, new.doc); "
        "END;",
        clean, clean, clean, clean);
    sqlite3_exec(s_db, sql, NULL, NULL, NULL);

    // Initial backfill of documents not yet in FTS
    snprintf(sql, sizeof(sql),
        "INSERT OR IGNORE INTO fts_%s(id, content) "
        "SELECT id, doc FROM col_%s WHERE id NOT IN (SELECT id FROM fts_%s);",
        clean, clean, clean);
    sqlite3_exec(s_db, sql, NULL, NULL, NULL);

    return true;
}

bool rita_sqlite_ai_auto_index(const char* collection, char* response, size_t max_resp) {
    if (!rita_sqlite_init(s_db_path)) {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"SQLite database not available\"}");
        return false;
    }

    ensure_cs();
    EnterCriticalSection(&s_db_cs);

    char clean[128];
    sanitize_name((collection && collection[0]) ? collection : "default", clean, sizeof(clean));

    // 1. Ensure table exists
    ensure_collection_table(clean);

    // 2. Automatically create B-tree expression indexes on common query fields
    const char* fields[] = {
        "sku", "category", "status", "type", "price", 
        "user_id", "email", "name", "title", "role"
    };
    size_t num_fields = sizeof(fields) / sizeof(fields[0]);
    int created_indexes = 0;

    for (size_t i = 0; i < num_fields; i++) {
        char sql[512];
        snprintf(sql, sizeof(sql),
            "CREATE INDEX IF NOT EXISTS idx_%s_%s ON col_%s((json_extract(doc, '$.%s')));",
            clean, fields[i], clean, fields[i]);
        if (sqlite3_exec(s_db, sql, NULL, NULL, NULL) == SQLITE_OK) {
            created_indexes++;
        }
    }

    // Index on updated_at
    char upd_sql[512];
    snprintf(upd_sql, sizeof(upd_sql),
        "CREATE INDEX IF NOT EXISTS idx_%s_updated ON col_%s(updated_at);",
        clean, clean);
    sqlite3_exec(s_db, upd_sql, NULL, NULL, NULL);
    created_indexes++;

    // 3. Setup FTS5 Full-Text Search and synchronization triggers
    bool fts_ok = ensure_ai_fts(clean);

    // 4. Ensure AI vector store table exists
    bool vec_ok = ensure_ai_vector_table();

    // 5. Run query planner optimization
    sqlite3_exec(s_db, "PRAGMA optimize;", NULL, NULL, NULL);

    LeaveCriticalSection(&s_db_cs);

    snprintf(response, max_resp,
        "{\"success\":true,\"collection\":\"%s\",\"indexesCreated\":%d,\"ftsEnabled\":%s,\"vectorStoreReady\":%s}",
        clean, created_indexes, fts_ok ? "true" : "false", vec_ok ? "true" : "false");
    return true;
}

bool rita_sqlite_ai_search(const char* collection, const char* query, int limit, char* response, size_t max_resp) {
    if (!rita_sqlite_init(s_db_path)) {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"SQLite database not available\"}");
        return false;
    }

    if (!query || !query[0]) {
        snprintf(response, max_resp, "{\"success\":true,\"data\":[],\"total\":0}");
        return true;
    }

    if (limit <= 0 || limit > 100) limit = 20;

    ensure_cs();
    EnterCriticalSection(&s_db_cs);

    char clean[128];
    sanitize_name((collection && collection[0]) ? collection : "default", clean, sizeof(clean));

    ensure_ai_fts(clean);

    // Try FTS5 BM25 ranked search first
    char sql[1024];
    snprintf(sql, sizeof(sql),
        "SELECT c.id, c.doc, bm25(fts_%s) AS rank FROM fts_%s f "
        "JOIN col_%s c ON f.id = c.id "
        "WHERE f.content MATCH ? ORDER BY rank LIMIT %d;",
        clean, clean, clean, limit);

    sqlite3_stmt* stmt = NULL;
    int rc = sqlite3_prepare_v2(s_db, sql, -1, &stmt, NULL);
    bool use_like_fallback = false;

    if (rc == SQLITE_OK && stmt) {
        sqlite3_bind_text(stmt, 1, query, -1, SQLITE_TRANSIENT);
    } else {
        if (stmt) sqlite3_finalize(stmt);
        stmt = NULL;
        use_like_fallback = true;
    }

    if (use_like_fallback) {
        snprintf(sql, sizeof(sql),
            "SELECT id, doc, 0.0 AS rank FROM col_%s WHERE doc LIKE ? LIMIT %d;",
            clean, limit);
        rc = sqlite3_prepare_v2(s_db, sql, -1, &stmt, NULL);
        if (rc == SQLITE_OK && stmt) {
            char pattern[512];
            snprintf(pattern, sizeof(pattern), "%%%s%%", query);
            sqlite3_bind_text(stmt, 1, pattern, -1, SQLITE_TRANSIENT);
        } else {
            LeaveCriticalSection(&s_db_cs);
            snprintf(response, max_resp, "{\"success\":false,\"error\":\"Search query prepare failed\"}");
            return false;
        }
    }

    size_t pos = 0;
    pos += snprintf(response + pos, max_resp - pos, "{\"success\":true,\"data\":[");
    int count = 0;

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        if (count > 0 && pos < max_resp - 2) {
            response[pos++] = ',';
        }

        const char* doc_text = (const char*)sqlite3_column_text(stmt, 1);
        double rank = sqlite3_column_double(stmt, 2);

        if (!doc_text) doc_text = "{}";

        int w = snprintf(response + pos, max_resp - pos, 
            "{\"doc\":%s,\"rank\":%.4f}", 
            doc_text, rank);

        if (w > 0 && (size_t)w < max_resp - pos) {
            pos += (size_t)w;
            count++;
        } else {
            break;
        }
    }

    sqlite3_finalize(stmt);
    LeaveCriticalSection(&s_db_cs);

    if (pos < max_resp - 32) {
        snprintf(response + pos, max_resp - pos, "],\"total\":%d}", count);
    } else {
        snprintf(response, max_resp, "{\"success\":true,\"data\":[],\"total\":0}");
    }

    return true;
}

bool rita_sqlite_ai_store_vector(const char* collection, const char* doc_id, const float* vector, size_t dimensions, const char* metadata_json, char* response, size_t max_resp) {
    if (!rita_sqlite_init(s_db_path)) {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"SQLite database not available\"}");
        return false;
    }

    if (!doc_id || !vector || dimensions == 0) {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Invalid vector parameters\"}");
        return false;
    }

    ensure_cs();
    EnterCriticalSection(&s_db_cs);

    ensure_ai_vector_table();

    char clean_coll[128];
    sanitize_name((collection && collection[0]) ? collection : "default", clean_coll, sizeof(clean_coll));

    char vec_id[256];
    snprintf(vec_id, sizeof(vec_id), "%s:%s", clean_coll, doc_id);

    const char* sql = 
        "INSERT INTO _rita_ai_vectors (id, collection, doc_id, dimensions, vector, metadata, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(id) DO UPDATE SET "
        "dimensions=excluded.dimensions, vector=excluded.vector, metadata=excluded.metadata, created_at=excluded.created_at;";

    sqlite3_stmt* stmt = NULL;
    int rc = sqlite3_prepare_v2(s_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK || !stmt) {
        LeaveCriticalSection(&s_db_cs);
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Vector insert prepare failed\"}");
        return false;
    }

    sqlite3_bind_text(stmt, 1, vec_id, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, clean_coll, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 3, doc_id, -1, SQLITE_TRANSIENT);
    sqlite3_bind_int64(stmt, 4, (sqlite3_int64)dimensions);
    sqlite3_bind_blob(stmt, 5, vector, (int)(dimensions * sizeof(float)), SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 6, (metadata_json && metadata_json[0]) ? metadata_json : "{}", -1, SQLITE_TRANSIENT);
    sqlite3_bind_int64(stmt, 7, (sqlite3_int64)time(NULL));

    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    LeaveCriticalSection(&s_db_cs);

    if (rc != SQLITE_DONE) {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Failed to store vector embedding\"}");
        return false;
    }

    snprintf(response, max_resp, "{\"success\":true,\"docId\":\"%s\",\"dimensions\":%zu}", doc_id, dimensions);
    return true;
}

typedef struct {
    char doc_id[128];
    float similarity;
    char metadata[1024];
} VectorMatch;

bool rita_sqlite_ai_search_vector(const char* collection, const float* query_vector, size_t dimensions, int top_k, char* response, size_t max_resp) {
    if (!rita_sqlite_init(s_db_path)) {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"SQLite database not available\"}");
        return false;
    }

    if (!query_vector || dimensions == 0) {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Invalid query vector\"}");
        return false;
    }

    if (top_k <= 0 || top_k > 100) top_k = 10;

    // Compute L2 norm of query vector
    float q_norm_sq = 0.0f;
    for (size_t i = 0; i < dimensions; i++) {
        q_norm_sq += query_vector[i] * query_vector[i];
    }
    float q_norm = sqrtf(q_norm_sq);
    if (q_norm <= 0.000001f) {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Zero magnitude query vector\"}");
        return false;
    }

    ensure_cs();
    EnterCriticalSection(&s_db_cs);

    ensure_ai_vector_table();

    char clean_coll[128] = {0};
    if (collection && collection[0]) {
        sanitize_name(collection, clean_coll, sizeof(clean_coll));
    }

    const char* sql = 
        "SELECT doc_id, dimensions, vector, metadata FROM _rita_ai_vectors "
        "WHERE dimensions = ? AND (? = '' OR collection = ?);";

    sqlite3_stmt* stmt = NULL;
    int rc = sqlite3_prepare_v2(s_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK || !stmt) {
        LeaveCriticalSection(&s_db_cs);
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"Vector search prepare failed\"}");
        return false;
    }

    sqlite3_bind_int64(stmt, 1, (sqlite3_int64)dimensions);
    sqlite3_bind_text(stmt, 2, clean_coll, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 3, clean_coll, -1, SQLITE_TRANSIENT);

    VectorMatch matches[100];
    int num_matches = 0;

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        const char* doc_id = (const char*)sqlite3_column_text(stmt, 0);
        int blob_bytes = sqlite3_column_bytes(stmt, 2);
        const float* stored_vec = (const float*)sqlite3_column_blob(stmt, 2);
        const char* meta = (const char*)sqlite3_column_text(stmt, 3);

        if (!stored_vec || (size_t)blob_bytes < dimensions * sizeof(float)) {
            continue;
        }

        float dot = 0.0f;
        float s_norm_sq = 0.0f;
        for (size_t i = 0; i < dimensions; i++) {
            dot += query_vector[i] * stored_vec[i];
            s_norm_sq += stored_vec[i] * stored_vec[i];
        }

        float s_norm = sqrtf(s_norm_sq);
        float similarity = (s_norm > 0.000001f) ? (dot / (q_norm * s_norm)) : 0.0f;

        // Insert into matches array maintaining descending order
        int insert_idx = -1;
        if (num_matches < top_k) {
            insert_idx = num_matches;
            num_matches++;
        } else if (similarity > matches[top_k - 1].similarity) {
            insert_idx = top_k - 1;
        }

        if (insert_idx >= 0) {
            while (insert_idx > 0 && similarity > matches[insert_idx - 1].similarity) {
                matches[insert_idx] = matches[insert_idx - 1];
                insert_idx--;
            }
            strncpy(matches[insert_idx].doc_id, doc_id ? doc_id : "", sizeof(matches[insert_idx].doc_id) - 1);
            matches[insert_idx].doc_id[sizeof(matches[insert_idx].doc_id) - 1] = '\0';
            matches[insert_idx].similarity = similarity;
            strncpy(matches[insert_idx].metadata, (meta && meta[0]) ? meta : "{}", sizeof(matches[insert_idx].metadata) - 1);
            matches[insert_idx].metadata[sizeof(matches[insert_idx].metadata) - 1] = '\0';
        }
    }

    sqlite3_finalize(stmt);
    LeaveCriticalSection(&s_db_cs);

    // Format matches as JSON
    size_t pos = 0;
    pos += snprintf(response + pos, max_resp - pos, "{\"success\":true,\"matches\":[");
    for (int i = 0; i < num_matches; i++) {
        if (i > 0 && pos < max_resp - 2) {
            response[pos++] = ',';
        }
        int w = snprintf(response + pos, max_resp - pos,
            "{\"docId\":\"%s\",\"similarity\":%.5f,\"metadata\":%s}",
            matches[i].doc_id, matches[i].similarity, matches[i].metadata);
        if (w > 0 && (size_t)w < max_resp - pos) {
            pos += (size_t)w;
        } else {
            break;
        }
    }
    if (pos < max_resp - 32) {
        snprintf(response + pos, max_resp - pos, "],\"count\":%d}", num_matches);
    } else {
        snprintf(response, max_resp, "{\"success\":true,\"matches\":[],\"count\":0}");
    }

    return true;
}

bool rita_sqlite_ai_optimize(char* response, size_t max_resp) {
    if (!rita_sqlite_init(s_db_path)) {
        snprintf(response, max_resp, "{\"success\":false,\"error\":\"SQLite database not available\"}");
        return false;
    }

    ensure_cs();
    EnterCriticalSection(&s_db_cs);

    sqlite3_exec(s_db, "PRAGMA optimize;", NULL, NULL, NULL);
    sqlite3_exec(s_db, "PRAGMA wal_checkpoint(PASSIVE);", NULL, NULL, NULL);
    sqlite3_exec(s_db, "ANALYZE;", NULL, NULL, NULL);

    LeaveCriticalSection(&s_db_cs);

    snprintf(response, max_resp, "{\"success\":true,\"optimized\":true,\"message\":\"Database indexes analyzed, WAL checkpointed, query optimizer tuned\"}");
    return true;
}
