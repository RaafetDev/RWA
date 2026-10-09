/**
 * ============================================================================
 * RDevCore/modules/integrated/database/mongoose.ts
 * ============================================================================
 * Production MongoDB Mongoose ODM & Direct SQL Engine for Real SQLite
 * High-performance, non-blocking, WAL-mode, memory-mapped storage engine
 * Built for POS systems, School Management, ERP, and Enterprise desktop applications.
 * ============================================================================
 */

import { rpc } from "../../../client/vue/rpc.ts";

export interface ModelDocument {
  _id?: string;
  [key: string]: any;
}

export class Schema {
  public definition: Record<string, any>;
  constructor(definition: Record<string, any>) {
    this.definition = definition;
  }
}

export class Model<T extends ModelDocument = ModelDocument> {
  constructor(public collectionName: string, public schema?: Schema) {}

  async find(filter: Record<string, any> = {}): Promise<T[]> {
    const res = await rpc("db", "find", this.collectionName, filter);
    return (res || []) as T[];
  }

  /**
   * Keyset / cursor-based pagination helper for large datasets
   */
  async paginate(
    filter: Record<string, any> = {},
    options: { limit?: number; lastId?: string; sort?: "asc" | "desc" } = {},
  ): Promise<{ items: T[]; nextCursor?: string; hasMore: boolean }> {
    const limit = options.limit ?? 50;
    const effectiveFilter = { ...filter };
    if (options.lastId) {
      effectiveFilter._id = {
        [options.sort === "desc" ? "$lt" : "$gt"]: options.lastId,
      };
    }
    const items = await this.find(effectiveFilter);
    const sliced = items.slice(0, limit);
    const hasMore = items.length > limit;
    const nextCursor = sliced.length > 0
      ? sliced[sliced.length - 1]?._id
      : undefined;
    return { items: sliced, nextCursor, hasMore };
  }

  /**
   * Async generator for streaming large document collections chunk-by-chunk
   */
  async *stream(
    filter: Record<string, any> = {},
    chunkSize = 500,
  ): AsyncGenerator<T> {
    let lastId: string | undefined = undefined;
    while (true) {
      const page = await this.paginate(filter, {
        limit: chunkSize,
        lastId,
        sort: "asc",
      });
      for (const item of page.items) {
        yield item;
      }
      if (!page.hasMore || !page.nextCursor) break;
      lastId = page.nextCursor;
    }
  }

  async findOne(filter: Record<string, any> = {}): Promise<T | null> {
    const res = await rpc("db", "findOne", this.collectionName, filter);
    return res as T | null;
  }

  async findById(id: string): Promise<T | null> {
    return await this.findOne({ _id: id });
  }

  async create(doc: T): Promise<T> {
    return await rpc("db", "create", this.collectionName, doc);
  }

  async insertOne(doc: T): Promise<T> {
    return await this.create(doc);
  }

  async updateOne(
    query: Record<string, any>,
    update: Record<string, any>,
  ): Promise<{ modifiedCount: number }> {
    return await rpc("db", "updateOne", this.collectionName, query, update);
  }

  async updateMany(
    query: Record<string, any>,
    update: Record<string, any>,
  ): Promise<{ modifiedCount: number }> {
    return await rpc("db", "updateMany", this.collectionName, query, update);
  }

  async deleteOne(
    query: Record<string, any>,
  ): Promise<{ deletedCount: number }> {
    return await rpc("db", "deleteOne", this.collectionName, query);
  }

  async deleteMany(
    query: Record<string, any>,
  ): Promise<{ deletedCount: number }> {
    return await rpc("db", "deleteMany", this.collectionName, query);
  }

  async countDocuments(filter: Record<string, any> = {}): Promise<number> {
    const count = await rpc(
      "db",
      "countDocuments",
      this.collectionName,
      filter,
    );
    return typeof count === "number"
      ? count
      : parseInt(String(count) || "0", 10);
  }

  async count(filter: Record<string, any> = {}): Promise<number> {
    return await this.countDocuments(filter);
  }

  async drop(): Promise<boolean> {
    return await rpc("db", "drop", this.collectionName);
  }

  async autoIndex() {
    return await db.ai.autoIndex(this.collectionName);
  }

  async aiSearch(
    query: string,
    limit: number = 20,
  ): Promise<Array<{ doc: T; rank: number }>> {
    const res = await db.ai.search<T>(this.collectionName, query, limit);
    return (res?.data || []).map((d: any) => ({
      doc: d.doc || d,
      rank: d.rank ?? 0,
    }));
  }
}

export const mongoose = {
  Schema,
  model<T extends ModelDocument = ModelDocument>(
    name: string,
    schema?: Schema | Record<string, any>,
  ): Model<T> {
    const actualSchema = schema instanceof Schema
      ? schema
      : new Schema(schema || {});
    return new Model<T>(name, actualSchema);
  },
};

/**
 * Universal Database Interface:
 * Combines full Mongoose ODM with Direct High-Performance SQLite SQL Engine
 */
export const db = {
  Schema,
  model: mongoose.model,

  // Direct SQL execution methods (backed by Real SQLite in C)
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const res = await rpc("db", "sqlQuery", sql, params);
    if (Array.isArray(res)) return res as T[];
    if (res && Array.isArray(res.data)) return res.data as T[];
    return [];
  },

  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return await this.query<T>(sql, params);
  },

  async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  },

  async run(
    sql: string,
    params: any[] = [],
  ): Promise<{ lastInsertRowid: number; changes: number }> {
    const res = await rpc("db", "sqlRun", sql, params);
    if (res && typeof res.lastInsertRowid === "number") {
      return res as { lastInsertRowid: number; changes: number };
    }
    if (res && typeof res.data === "object" && res.data) {
      return res.data;
    }
    return { lastInsertRowid: 0, changes: 0 };
  },

  async exec(sql: string): Promise<boolean> {
    const res = await rpc("db", "sqlExec", sql);
    return res && res.success;
  },

  async batch(
    queries: Array<{ sql: string; params?: any[] } | string>,
  ): Promise<void> {
    if (!queries || queries.length === 0) return;
    try {
      const res = await rpc("db", "sqlBatch", queries);
      if (res && (res === true || res.success !== false)) {
        return;
      }
    } catch {
      // Fallback to sequential in transaction
    }
    await this.exec("BEGIN IMMEDIATE TRANSACTION;");
    try {
      for (const q of queries) {
        if (typeof q === "string") {
          await this.exec(q);
        } else if (q && typeof q === "object") {
          await this.run(q.sql, q.params || []);
        }
      }
      await this.exec("COMMIT;");
    } catch (e) {
      await this.exec("ROLLBACK;");
      throw e;
    }
  },

  async transaction(
    fnOrQueries:
      | ((tx: any) => Promise<void>)
      | Array<{ sql: string; params?: any[] } | string>,
  ): Promise<void> {
    if (typeof fnOrQueries === "function") {
      await this.exec("BEGIN IMMEDIATE TRANSACTION;");
      try {
        await fnOrQueries(this);
        await this.exec("COMMIT;");
      } catch (e) {
        await this.exec("ROLLBACK;");
        throw e;
      }
    } else if (Array.isArray(fnOrQueries)) {
      await this.batch(fnOrQueries);
    }
  },

  // AI Automated Indexing, BM25 FTS5 Full-Text Search & Vector Engine
  ai: {
    async autoIndex(
      collection: string = "",
    ): Promise<
      {
        success: boolean;
        collection: string;
        indexesCreated: number;
        ftsEnabled: boolean;
        vectorStoreReady: boolean;
      }
    > {
      const res = await rpc("db", "aiAutoIndex", collection);
      return res ||
        {
          success: false,
          collection,
          indexesCreated: 0,
          ftsEnabled: false,
          vectorStoreReady: false,
        };
    },

    async search<T = any>(
      collection: string,
      query: string,
      limit: number = 20,
    ): Promise<
      { success: boolean; data: Array<{ doc: T; rank: number }>; total: number }
    > {
      const res = await rpc("db", "aiSearch", collection, query, limit);
      if (Array.isArray(res)) {
        return { success: true, data: res, total: res.length };
      }
      if (res && typeof res === "object") {
        const data = Array.isArray(res.data) ? res.data : [];
        const total = typeof res.total === "number" ? res.total : data.length;
        return { success: res.success ?? true, data, total };
      }
      return { success: false, data: [], total: 0 };
    },

    async storeVector(
      collection: string,
      docId: string,
      vector: number[],
      metadata: Record<string, any> = {},
    ): Promise<{ success: boolean; docId: string; dimensions: number }> {
      const res = await rpc("db", "aiStoreVector", {
        collection,
        docId,
        vector,
        metadata,
      });
      return res || { success: false, docId, dimensions: vector.length };
    },

    async searchVector(
      collection: string,
      queryVector: number[],
      topK: number = 10,
    ): Promise<
      {
        success: boolean;
        matches: Array<{ docId: string; similarity: number; metadata: any }>;
        count: number;
      }
    > {
      const res = await rpc("db", "aiSearchVector", {
        collection,
        vector: queryVector,
        topK,
      });
      let parsed = res;
      if (typeof res === "string") {
        try {
          parsed = JSON.parse(res);
        } catch {
          parsed = { matches: [], count: 0 };
        }
      }
      const matches = Array.isArray(parsed?.matches)
        ? parsed.matches
        : (Array.isArray(parsed) ? parsed : []);
      return {
        success: parsed?.success ?? true,
        matches,
        count: typeof parsed?.count === "number"
          ? parsed.count
          : matches.length,
      };
    },

    async optimize(): Promise<{ success: boolean; message: string }> {
      const res = await rpc("db", "aiOptimize");
      return res || { success: false, message: "" };
    },
  },
};

export const sqlite = db;
export const sqlite3 = db;
export default mongoose;
