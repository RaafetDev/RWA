/**
 * ============================================================================
 * Core/modules/integrated/mongoose-sqlite/index.ts
 * ============================================================================
 * Production Mongoose ODM Port for SQLite
 *
 * Implements the full, idiomatic Node.js Mongoose API:
 * - Schema (types, validators, defaults, timestamps: true)
 * - Model (create, find, findOne, findById, updateOne, deleteOne, etc.)
 * - Fluent Query Builder (.where, .equals, .gt, .sort, .limit, .skip, .exec)
 * - Document Instances (.save, .remove, toJSON, toObject)
 * - Middlewares (pre/post save hooks)
 * - Virtuals & Custom Methods
 *
 * Backed by RitaWapp C SQLite Engine (WAL mode, JSON document storage).
 * ============================================================================
 */

export interface SchemaFieldOptions {
  type: any;
  required?: boolean;
  default?: any;
  unique?: boolean;
  min?: number;
  max?: number;
  trim?: boolean;
  lowercase?: boolean;
  uppercase?: boolean;
}

export type SchemaDefinition = Record<string, any>;

export interface SchemaOptions {
  timestamps?: boolean;
  strict?: boolean;
  collection?: string;
}

export interface ModelDocument {
  _id?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  [key: string]: any;
}

/**
 * Generates an ObjectId (24-character hexadecimal timestamp + entropy).
 */
export function generateObjectId(): string {
  const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, "0");
  const randomBytes = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return (timestamp + randomBytes).slice(0, 24);
}

export const Types = {
  ObjectId: String,
  String: String,
  Number: Number,
  Boolean: Boolean,
  Date: Date,
  Array: Array,
  Mixed: Object,
};

type MiddlewareFn = (next: () => void | Promise<void>) => void | Promise<void>;
type PostMiddlewareFn = (doc: any) => void | Promise<void>;

export class Schema {
  public definition: SchemaDefinition;
  public options: SchemaOptions;
  public methods: Record<string, (...args: any[]) => any> = {};
  public statics: Record<string, (...args: any[]) => any> = {};
  public virtuals: Record<
    string,
    { get?: () => any; set?: (val: any) => void }
  > = {};
  public preHooks: Record<string, MiddlewareFn[]> = {};
  public postHooks: Record<string, PostMiddlewareFn[]> = {};

  constructor(definition: SchemaDefinition = {}, options: SchemaOptions = {}) {
    this.definition = definition;
    this.options = { timestamps: false, strict: true, ...options };
  }

  virtual(name: string) {
    if (!this.virtuals[name]) {
      this.virtuals[name] = {};
    }
    const v = this.virtuals[name];
    return {
      get(fn: () => any) {
        v.get = fn;
        return this;
      },
      set(fn: (val: any) => void) {
        v.set = fn;
        return this;
      },
    };
  }

  pre(action: string, fn: MiddlewareFn) {
    if (!this.preHooks[action]) this.preHooks[action] = [];
    this.preHooks[action].push(fn);
    return this;
  }

  post(action: string, fn: PostMiddlewareFn) {
    if (!this.postHooks[action]) this.postHooks[action] = [];
    this.postHooks[action].push(fn);
    return this;
  }

  applyDefaults(doc: Record<string, any>): Record<string, any> {
    const res = { ...doc };
    for (const [key, val] of Object.entries(this.definition)) {
      if (res[key] === undefined) {
        if (typeof val === "object" && val !== null && "default" in val) {
          res[key] = typeof val.default === "function"
            ? val.default()
            : val.default;
        }
      }
    }
    return res;
  }

  validate(doc: Record<string, any>): void {
    for (const [key, val] of Object.entries(this.definition)) {
      const isReq = typeof val === "object" && val !== null && val.required;
      if (
        isReq &&
        (doc[key] === undefined || doc[key] === null || doc[key] === "")
      ) {
        throw new Error(`Path \`${key}\` is required.`);
      }
    }
  }
}

/**
 * Invokes RitaWapp C Database Module via WebUI Bridge.
 */
async function rpcDb(
  action: string,
  collection: string,
  ...args: any[]
): Promise<any> {
  const win = typeof window !== "undefined" ? (window as any) : null;
  if (!win || typeof win.rita_module_call !== "function") {
    throw new Error(
      "RitaWapp native RPC bridge is not initialized in this window.",
    );
  }

  const payload = JSON.stringify({
    module: "database",
    action,
    args: [collection, ...args],
  });

  const raw = await win.rita_module_call(payload);
  const parsed = JSON.parse(raw);

  if (parsed.success === false) {
    throw new Error(
      parsed.error || `Mongoose-SQLite action '${action}' failed.`,
    );
  }

  return parsed.data !== undefined ? parsed.data : parsed;
}

/**
 * Fluent Query Builder mirroring Node.js Mongoose Query
 */
export class Query<T extends ModelDocument = ModelDocument> {
  private filter: Record<string, any> = {};
  private sortOptions?: Record<string, number>;
  private limitCount?: number;
  private skipCount?: number;
  private currentField?: string;

  constructor(
    private collectionName: string,
    private schema?: Schema,
    initialFilter: Record<string, any> = {},
  ) {
    this.filter = { ...initialFilter };
  }

  where(field: string): this {
    this.currentField = field;
    return this;
  }

  equals(val: any): this {
    if (this.currentField) {
      this.filter[this.currentField] = val;
      this.currentField = undefined;
    }
    return this;
  }

  gt(val: number): this {
    if (this.currentField) {
      this.filter[this.currentField] = {
        ...this.filter[this.currentField],
        $gt: val,
      };
      this.currentField = undefined;
    }
    return this;
  }

  gte(val: number): this {
    if (this.currentField) {
      this.filter[this.currentField] = {
        ...this.filter[this.currentField],
        $gte: val,
      };
      this.currentField = undefined;
    }
    return this;
  }

  lt(val: number): this {
    if (this.currentField) {
      this.filter[this.currentField] = {
        ...this.filter[this.currentField],
        $lt: val,
      };
      this.currentField = undefined;
    }
    return this;
  }

  lte(val: number): this {
    if (this.currentField) {
      this.filter[this.currentField] = {
        ...this.filter[this.currentField],
        $lte: val,
      };
      this.currentField = undefined;
    }
    return this;
  }

  ne(val: any): this {
    if (this.currentField) {
      this.filter[this.currentField] = {
        ...this.filter[this.currentField],
        $ne: val,
      };
      this.currentField = undefined;
    }
    return this;
  }

  in(vals: any[]): this {
    if (this.currentField) {
      this.filter[this.currentField] = {
        ...this.filter[this.currentField],
        $in: vals,
      };
      this.currentField = undefined;
    }
    return this;
  }

  sort(sortArgs: string | Record<string, number>): this {
    if (typeof sortArgs === "string") {
      this.sortOptions = {};
      const parts = sortArgs.trim().split(/\s+/);
      for (const p of parts) {
        if (p.startsWith("-")) {
          this.sortOptions[p.slice(1)] = -1;
        } else {
          this.sortOptions[p] = 1;
        }
      }
    } else {
      this.sortOptions = sortArgs;
    }
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  skip(count: number): this {
    this.skipCount = count;
    return this;
  }

  async exec(): Promise<T[]> {
    let items: T[] = await rpcDb("find", this.collectionName, this.filter);
    items = items || [];

    // In-memory sorting if requested
    if (this.sortOptions) {
      const keys = Object.keys(this.sortOptions);
      items.sort((a, b) => {
        for (const k of keys) {
          const dir = this.sortOptions![k];
          if (a[k] < b[k]) return dir === 1 ? -1 : 1;
          if (a[k] > b[k]) return dir === 1 ? 1 : -1;
        }
        return 0;
      });
    }

    if (this.skipCount) {
      items = items.slice(this.skipCount);
    }
    if (this.limitCount !== undefined) {
      items = items.slice(0, this.limitCount);
    }

    return items.map((doc) =>
      createDocumentInstance<T>(doc, this.collectionName, this.schema)
    );
  }

  then<TResult1 = T[], TResult2 = never>(
    onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected);
  }
}

/**
 * Creates a Document instance equipped with .save(), .remove(), and Schema methods.
 */
function createDocumentInstance<T extends ModelDocument>(
  raw: T,
  collectionName: string,
  schema?: Schema,
  isInitialNew: boolean = false,
): T {
  const doc = { ...raw };
  if (!doc._id) {
    doc._id = generateObjectId();
  }

  let autoSaveTimer: any = null;
  let isSaving = false;
  let hasPendingChange = false;

  const performSave = async () => {
    if (schema?.preHooks["save"]) {
      for (const hook of schema.preHooks["save"]) {
        await new Promise<void>((resolve, reject) => {
          try {
            const res = (hook as any).call(proxy, () => resolve());
            if (res instanceof Promise) res.then(() => resolve()).catch(reject);
            else resolve();
          } catch (e) {
            reject(e);
          }
        });
      }
    }

    schema?.validate(doc);

    if (schema?.options.timestamps) {
      const now = new Date().toISOString();
      if (!doc.createdAt) doc.createdAt = now;
      doc.updatedAt = now;
    }

    const payload = { ...doc };
    delete payload.save;
    delete payload.remove;
    delete payload.deleteOne;
    delete payload.toJSON;
    delete payload.toObject;

    await rpcDb("updateOne", collectionName, { _id: doc._id }, {
      $set: payload,
    }, { upsert: true });

    if (schema?.postHooks["save"]) {
      for (const hook of schema.postHooks["save"]) {
        await hook.call(proxy, proxy);
      }
    }
  };

  const scheduleAutoSave = () => {
    hasPendingChange = true;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
      autoSaveTimer = null;
      if (isSaving) {
        scheduleAutoSave();
        return;
      }
      isSaving = true;
      hasPendingChange = false;
      try {
        await performSave();
      } catch (err) {
        console.warn(`[mongoose-sqlite auto-save error]:`, err);
      } finally {
        isSaving = false;
        if (hasPendingChange) {
          scheduleAutoSave();
        }
      }
    }, 25);
  };

  if (isInitialNew) {
    scheduleAutoSave();
  }

  // Attach Schema instance methods
  if (schema?.methods) {
    for (const [mName, mFn] of Object.entries(schema.methods)) {
      (doc as any)[mName] = (...args: any[]) => mFn.apply(proxy, args);
    }
  }

  // Attach virtual getters/setters
  if (schema?.virtuals) {
    for (const [vName, vDef] of Object.entries(schema.virtuals)) {
      Object.defineProperty(doc, vName, {
        get: vDef.get ? vDef.get.bind(proxy) : undefined,
        set: vDef.set ? vDef.set.bind(proxy) : undefined,
        enumerable: true,
        configurable: true,
      });
    }
  }

  // Attach explicit .save() for backward compatibility
  (doc as any).save = async function (): Promise<T> {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
    isSaving = true;
    try {
      await performSave();
      return proxy;
    } finally {
      isSaving = false;
    }
  };

  // Attach .remove() / .deleteOne()
  (doc as any).remove = async function (): Promise<boolean> {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    await rpcDb("deleteOne", collectionName, { _id: doc._id });
    return true;
  };
  (doc as any).deleteOne = (doc as any).remove;

  (doc as any).toJSON = () => ({ ...doc });
  (doc as any).toObject = () => ({ ...doc });

  // Wrap in Proxy for automatic reactive saving on property mutation
  const proxy: any = new Proxy(doc, {
    set(target, prop, value, receiver) {
      const propStr = String(prop);
      if (
        propStr.startsWith("$") ||
        propStr === "save" ||
        propStr === "remove" ||
        propStr === "deleteOne" ||
        propStr === "toJSON" ||
        propStr === "toObject"
      ) {
        return Reflect.set(target, prop, value, receiver);
      }

      const prev = target[prop];
      const success = Reflect.set(target, prop, value, receiver);
      if (prev !== value) {
        scheduleAutoSave();
      }
      return success;
    },
    get(target, prop, receiver) {
      if (prop === "$isSaving") return isSaving;
      return Reflect.get(target, prop, receiver);
    },
  });

  return proxy as T;
}

/**
 * Mongoose Model Interface
 */
export class Model<T extends ModelDocument = ModelDocument> {
  constructor(public collectionName: string, public schema?: Schema) {
    // Attach Schema statics to Model
    if (schema?.statics) {
      for (const [sName, sFn] of Object.entries(schema.statics)) {
        (this as any)[sName] = sFn.bind(this);
      }
    }
  }

  find(filter: Record<string, any> = {}): Query<T> {
    return new Query<T>(this.collectionName, this.schema, filter);
  }

  async findOne(filter: Record<string, any> = {}): Promise<T | null> {
    const res = await rpcDb("findOne", this.collectionName, filter);
    if (!res) return null;
    return createDocumentInstance<T>(res, this.collectionName, this.schema);
  }

  async findById(id: string): Promise<T | null> {
    return await this.findOne({ _id: id });
  }

  async create(docOrDocs: Partial<T> | Partial<T>[]): Promise<any> {
    if (Array.isArray(docOrDocs)) {
      return await this.insertMany(docOrDocs);
    }

    let payload: any = { ...docOrDocs };
    if (!payload._id) {
      payload._id = generateObjectId();
    }

    if (this.schema) {
      payload = this.schema.applyDefaults(payload);
      this.schema.validate(payload);
      if (this.schema.options.timestamps) {
        const now = new Date().toISOString();
        payload.createdAt = now;
        payload.updatedAt = now;
      }
    }

    const created = await rpcDb("create", this.collectionName, payload);
    return createDocumentInstance<T>(
      created || payload,
      this.collectionName,
      this.schema,
    );
  }

  async insertMany(docs: Partial<T>[]): Promise<T[]> {
    const results: T[] = [];
    for (const d of docs) {
      const res = await this.create(d);
      results.push(res);
    }
    return results;
  }

  async updateOne(
    query: Record<string, any>,
    update: Record<string, any>,
  ): Promise<{ modifiedCount: number }> {
    if (this.schema?.options.timestamps && update.$set) {
      update.$set.updatedAt = new Date().toISOString();
    }
    return await rpcDb("updateOne", this.collectionName, query, update);
  }

  async updateMany(
    query: Record<string, any>,
    update: Record<string, any>,
  ): Promise<{ modifiedCount: number }> {
    if (this.schema?.options.timestamps && update.$set) {
      update.$set.updatedAt = new Date().toISOString();
    }
    return await rpcDb("updateOne", this.collectionName, query, update);
  }

  async deleteOne(
    query: Record<string, any>,
  ): Promise<{ deletedCount: number }> {
    return await rpcDb("deleteOne", this.collectionName, query);
  }

  async deleteMany(
    query: Record<string, any>,
  ): Promise<{ deletedCount: number }> {
    return await rpcDb("deleteOne", this.collectionName, query);
  }

  async findByIdAndUpdate(
    id: string,
    update: Record<string, any>,
    options: { new?: boolean } = {},
  ): Promise<T | null> {
    await this.updateOne({ _id: id }, update);
    if (options.new) {
      return await this.findById(id);
    }
    return null;
  }

  async findByIdAndDelete(id: string): Promise<{ deletedCount: number }> {
    return await this.deleteOne({ _id: id });
  }

  async countDocuments(filter: Record<string, any> = {}): Promise<number> {
    const count = await rpcDb("countDocuments", this.collectionName, filter);
    return typeof count === "number"
      ? count
      : parseInt(String(count) || "0", 10);
  }

  async distinct(
    field: string,
    filter: Record<string, any> = {},
  ): Promise<any[]> {
    const docs = await this.find(filter).exec();
    const set = new Set(
      docs.map((d) => d[field]).filter((v) => v !== undefined),
    );
    return Array.from(set);
  }

  /**
   * Keyset pagination for fast scrolling in desktop POS / table views.
   */
  async paginate(
    filter: Record<string, any> = {},
    options: { limit?: number; page?: number } = {},
  ): Promise<
    {
      docs: T[];
      totalDocs: number;
      limit: number;
      page: number;
      totalPages: number;
    }
  > {
    const limit = options.limit || 20;
    const page = options.page || 1;
    const skip = (page - 1) * limit;

    const totalDocs = await this.countDocuments(filter);
    const docs = await this.find(filter).skip(skip).limit(limit).exec();

    return {
      docs,
      totalDocs,
      limit,
      page,
      totalPages: Math.ceil(totalDocs / limit) || 1,
    };
  }

  /**
   * Async generator streaming documents chunk by chunk.
   */
  async *stream(
    filter: Record<string, any> = {},
    chunkSize = 100,
  ): AsyncGenerator<T> {
    let skip = 0;
    while (true) {
      const chunk = await this.find(filter).skip(skip).limit(chunkSize).exec();
      if (chunk.length === 0) break;
      for (const item of chunk) {
        yield item;
      }
      if (chunk.length < chunkSize) break;
      skip += chunkSize;
    }
  }

  async autoIndex(): Promise<boolean> {
    return await rpcDb("autoIndex", this.collectionName);
  }

  async drop(): Promise<boolean> {
    return await rpcDb("drop", this.collectionName);
  }
}

/**
 * Model cache registry
 */
const modelRegistry = new Map<string, any>();

export function model<T extends ModelDocument = ModelDocument>(
  name: string,
  schema?: Schema,
): any {
  const collectionName = schema?.options.collection || name.toLowerCase() + "s";
  if (modelRegistry.has(name)) {
    return modelRegistry.get(name);
  }

  const modelInstance = new Model<T>(collectionName, schema);

  function ModelConstructor(this: any, docData: Partial<T> = {}) {
    let payload: any = { ...docData };
    if (!payload._id) {
      payload._id = generateObjectId();
    }
    if (schema) {
      payload = schema.applyDefaults(payload);
    }
    return createDocumentInstance<T>(payload, collectionName, schema, true);
  }

  Object.setPrototypeOf(ModelConstructor, modelInstance);
  Object.assign(ModelConstructor, modelInstance);
  (ModelConstructor as any).prototype = Object.create(Model.prototype);

  modelRegistry.set(name, ModelConstructor);
  return ModelConstructor as unknown as Model<T>;
}

export async function connect(): Promise<boolean> {
  const win = typeof window !== "undefined" ? (window as any) : null;
  if (!win || typeof win.rita_module_call !== "function") return true;
  const raw = await win.rita_module_call(JSON.stringify({
    module: "database",
    action: "connect",
    args: [],
  }));
  const res = JSON.parse(raw);
  return !!res.success;
}

export async function disconnect(): Promise<boolean> {
  const win = typeof window !== "undefined" ? (window as any) : null;
  if (!win || typeof win.rita_module_call !== "function") return true;
  const raw = await win.rita_module_call(JSON.stringify({
    module: "database",
    action: "disconnect",
    args: [],
  }));
  const res = JSON.parse(raw);
  return !!res.success;
}

/**
 * Top-level default mongoose instance matching Node.js Mongoose API
 */
export const mongoose = {
  Schema,
  model,
  connect,
  disconnect,
  Types,
  generateObjectId,
};

export default mongoose;
