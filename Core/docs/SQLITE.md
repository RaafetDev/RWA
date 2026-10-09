# RitaWapp Embedded SQLite Engine (v1.0.1)

## 1. Engine Configuration

- `journal_mode = WAL`: High-concurrency Write-Ahead Logging.
- `synchronous = NORMAL`: Balancing disk durability with performance.
- `cache_size = -64000`: 64 MB memory cache.
- `mmap_size = 268435456`: 256 MB memory-mapped file access.
- `temp_store = MEMORY`: Zero temporary disk spooling.
- Virtual tables: **FTS5** (BM25 full-text indexing) and **JSON1** extension
  enabled.

## 2. API Surface

- **Direct SQL API**: `db.query(sql, params)`, `db.run(sql, params)`,
  `db.exec(sql)`, `db.get(sql, params)`, `db.transaction(ops)`,
  `db.batch(queries)`.
- **Mongoose ODM**: `mongoose.Schema`, `mongoose.model(name, schema)`.
  - Keyset pagination: `Model.paginate(filter, options)`.
  - Async chunk stream: `Model.stream(filter, chunkSize)`.
- **AI Engine (`db.ai`)**:
  - `autoIndex(collection)`: Automatically adds B-tree expression indexes and
    FTS5 synchronization.
  - `search(collection, query, limit)`: Fast BM25 full-text retrieval.
  - `storeVector(collection, docId, vector, meta)`: Vector embeddings storage up
    to 2048 dimensions.
  - `searchVector(collection, queryVector, topK)`: Top-K cosine similarity
    computation in C.
