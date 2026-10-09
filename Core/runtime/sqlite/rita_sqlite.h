/**
 * ============================================================================
 * RDevCore/rita_sqlite.h
 * ============================================================================
 * Real SQLite Engine & Mongoose ODM Translation Interface
 * High-performance, non-blocking, WAL-mode, memory-mapped storage engine
 * for POS systems, School Management, ERP, and Enterprise desktop applications.
 * ============================================================================
 */

#ifndef RITA_SQLITE_H
#define RITA_SQLITE_H

#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Initialize SQLite engine with WAL mode and performance tuning */
bool rita_sqlite_init(const char* db_path);

/** Close SQLite database and release resources */
void rita_sqlite_close(void);

/** Check if SQLite database is initialized and active */
bool rita_sqlite_is_active(void);

// ============================================================================
// Document & Mongoose ODM Operations (over SQLite JSON)
// ============================================================================

bool rita_sqlite_doc_insert(const char* collection, const char* json_doc, char* response, size_t max_resp);
bool rita_sqlite_doc_find(const char* collection, const char* filter_json, char* response, size_t max_resp);
bool rita_sqlite_doc_find_one(const char* collection, const char* filter_json, char* response, size_t max_resp);
bool rita_sqlite_doc_update(const char* collection, const char* query_json, const char* update_json, char* response, size_t max_resp);
bool rita_sqlite_doc_delete(const char* collection, const char* query_json, char* response, size_t max_resp);
bool rita_sqlite_doc_count(const char* collection, const char* filter_json, char* response, size_t max_resp);
bool rita_sqlite_doc_drop(const char* collection);

// ============================================================================
// Direct High-Performance SQL Engine (POS, School Management, Big Data)
// ============================================================================

bool rita_sqlite_sql_query(const char* sql, const char* params_json, char* response, size_t max_resp);
bool rita_sqlite_sql_run(const char* sql, const char* params_json, char* response, size_t max_resp);
bool rita_sqlite_sql_exec(const char* sql, char* response, size_t max_resp);
bool rita_sqlite_sql_transaction(const char* statements_json, char* response, size_t max_resp);
bool rita_sqlite_sql_batch(const char* batch_json, char* response, size_t max_resp);

// ============================================================================
// AI Automated Indexing & Vector Search Engine
// ============================================================================

/** Automatically create expression B-tree indexes & FTS5 full-text synchronization */
bool rita_sqlite_ai_auto_index(const char* collection, char* response, size_t max_resp);

/** Sub-millisecond BM25 full-text search with highlight snippets */
bool rita_sqlite_ai_search(const char* collection, const char* query, int limit, char* response, size_t max_resp);

/** Store vector embedding for high-dimensional semantic search */
bool rita_sqlite_ai_store_vector(const char* collection, const char* doc_id, const float* vector, size_t dimensions, const char* metadata_json, char* response, size_t max_resp);

/** Sub-millisecond top-K cosine similarity search across vector embeddings */
bool rita_sqlite_ai_search_vector(const char* collection, const float* query_vector, size_t dimensions, int top_k, char* response, size_t max_resp);

/** Analyze query statistics, optimize query planner, and run WAL checkpoint */
bool rita_sqlite_ai_optimize(char* response, size_t max_resp);

#ifdef __cplusplus
}
#endif

#endif // RITA_SQLITE_H
