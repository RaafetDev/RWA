# Mongoose-SQLite Integrated Module

A pure TypeScript port of Node.js **Mongoose ODM** for the **RitaWapp Desktop
Framework**, backed directly by RitaWapp's high-performance native SQLite 3
storage engine (WAL mode, memory-mapped I/O, JSON document tables).

---

## Features

- **Standard Mongoose API**: `Schema`, `model`, `new Schema(...)`,
  `{ timestamps: true }`.
- **Query Builder**: Fluent chainable
  `.find().where().equals().sort().limit().skip().exec()`.
- **Document Instances**: `.save()`, `.remove()`, `.toJSON()`, custom instance
  methods, and virtuals.
- **Middleware**: Pre-save and post-save lifecycle hooks
  (`schema.pre('save', fn)`).
- **Embedded Performance**: Executes directly in the local SQLite database
  without any network latency or external MongoDB server.

---

## Quick Example

```typescript
import mongoose, {
  Schema,
} from "./Core/modules/integrated/mongoose-sqlite/index.ts";

// 1. Define Schema
const ProductSchema = new Schema({
  name: { type: String, required: true },
  price: { type: Number, default: 0 },
  category: String,
  inStock: { type: Boolean, default: true },
}, {
  timestamps: true, // Adds createdAt, updatedAt
});

// Custom instance method
ProductSchema.methods.applyDiscount = function (percent: number) {
  this.price = this.price * (1 - percent / 100);
  return this.save();
};

// 2. Register Model
const Product = mongoose.model("Product", ProductSchema);

// 3. Create document
const item = await Product.create({
  name: "Mechanical Keyboard",
  price: 99.99,
  category: "Electronics",
});

// 4. Query with fluent builder
const affordable = await Product.find()
  .where("price").lt(100)
  .sort({ price: 1 })
  .limit(10)
  .exec();

// 5. Update
await item.applyDiscount(15);
```
