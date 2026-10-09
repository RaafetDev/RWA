/**
 * RitaWapp wsApi Central Method Registry & Schema Exporter
 */

import { INTEGRATED_MODULES } from "../modules/integrated/registry.ts";

export interface MethodDefinition {
  name: string;
  description: string;
  scope: string;
  paramsSchema?: Record<string, any>;
}

export const WSAPI_METHODS: Record<string, MethodDefinition> = {
  // rwa.*
  "rwa.hello": {
    name: "rwa.hello",
    description: "Authenticate and establish session handshake.",
    scope: "public",
  },
  "rwa.ping": {
    name: "rwa.ping",
    description: "Heartbeat health check.",
    scope: "public",
  },
  "rwa.methods": {
    name: "rwa.methods",
    description: "List all supported server RPC methods.",
    scope: "public",
  },
  "rwa.schema": {
    name: "rwa.schema",
    description: "Return the complete AsyncAPI / JSON Schema document.",
    scope: "public",
  },
  "rwa.subscribe": {
    name: "rwa.subscribe",
    description: "Subscribe to server push events.",
    scope: "project:read",
  },
  "rwa.unsubscribe": {
    name: "rwa.unsubscribe",
    description: "Unsubscribe from push event topics.",
    scope: "project:read",
  },
  "rwa.cancel": {
    name: "rwa.cancel",
    description: "Cancel an active running request or job.",
    scope: "job:run",
  },
  "rwa.version": {
    name: "rwa.version",
    description: "Get RitaWapp framework version.",
    scope: "public",
  },
  "rwa.shutdown": {
    name: "rwa.shutdown",
    description: "Gracefully shut down wsApi server.",
    scope: "admin",
  },

  // project.*
  "project.init": {
    name: "project.init",
    description: "Scaffold a new project template.",
    scope: "project:write",
  },
  "project.open": {
    name: "project.open",
    description: "Open an existing RitaWapp project.",
    scope: "project:read",
  },
  "project.info": {
    name: "project.info",
    description: "Get project configuration and stats.",
    scope: "project:read",
  },
  "project.list": {
    name: "project.list",
    description: "List projects in directory.",
    scope: "project:read",
  },
  "project.validate": {
    name: "project.validate",
    description: "Validate project configuration.",
    scope: "project:read",
  },
  "project.config.get": {
    name: "project.config.get",
    description: "Read current config.",
    scope: "project:read",
  },
  "project.config.set": {
    name: "project.config.set",
    description: "Write updated config with validation.",
    scope: "project:write",
  },
  "project.config.schema": {
    name: "project.config.schema",
    description: "Get schema for RitaWapp.config.ts.",
    scope: "project:read",
  },

  // module.*
  "module.list": {
    name: "module.list",
    description: "List all 18 modules with enabled status.",
    scope: "project:read",
  },
  "module.enable": {
    name: "module.enable",
    description: "Enable a module in the project config.",
    scope: "project:write",
  },
  "module.disable": {
    name: "module.disable",
    description: "Disable a module in the project config.",
    scope: "project:write",
  },
  "module.describe": {
    name: "module.describe",
    description: "Get details and actions of a module.",
    scope: "project:read",
  },
  "module.create": {
    name: "module.create",
    description: "Scaffold a custom module.",
    scope: "project:write",
  },

  // job.*
  "job.build": {
    name: "job.build",
    description: "Trigger production compile and packaging.",
    scope: "job:run",
  },
  "job.dev.start": {
    name: "job.dev.start",
    description: "Start dev server and runtime with DevTools.",
    scope: "job:run",
  },
  "job.dev.stop": {
    name: "job.dev.stop",
    description: "Stop dev server.",
    scope: "job:run",
  },
  "job.test": {
    name: "job.test",
    description: "Run test suite.",
    scope: "job:run",
  },
  "job.check": {
    name: "job.check",
    description: "Run typecheck.",
    scope: "job:run",
  },
  "job.lint": {
    name: "job.lint",
    description: "Run linter.",
    scope: "job:run",
  },
  "job.fmt": {
    name: "job.fmt",
    description: "Run formatter.",
    scope: "job:run",
  },
  "job.doctor": {
    name: "job.doctor",
    description: "Run doctor diagnostics.",
    scope: "job:run",
  },
  "job.bench": {
    name: "job.bench",
    description: "Run benchmark suite.",
    scope: "job:run",
  },
  "job.packed": {
    name: "job.packed",
    description: "Package distributable module.",
    scope: "job:run",
  },
  "job.release": {
    name: "job.release",
    description: "Create release archive.",
    scope: "job:run",
  },
  "job.installDev": {
    name: "job.installDev",
    description: "Preview installer card.",
    scope: "job:run",
  },
  "job.list": {
    name: "job.list",
    description: "List active and historical jobs.",
    scope: "job:run",
  },
  "job.get": {
    name: "job.get",
    description: "Get status of a specific job.",
    scope: "job:run",
  },
  "job.cancel": {
    name: "job.cancel",
    description: "Cancel a running job.",
    scope: "job:run",
  },

  // app.*
  "app.start": {
    name: "app.start",
    description: "Launch built application executable.",
    scope: "app:control",
  },
  "app.stop": {
    name: "app.stop",
    description: "Terminate running application.",
    scope: "app:control",
  },
  "app.restart": {
    name: "app.restart",
    description: "Restart application.",
    scope: "app:control",
  },
  "app.status": {
    name: "app.status",
    description: "Check if app is running.",
    scope: "app:control",
  },
  "app.attach": {
    name: "app.attach",
    description: "Attach to application RPC bridge.",
    scope: "app:control",
  },
  "app.detach": {
    name: "app.detach",
    description: "Detach from application.",
    scope: "app:control",
  },
  "app.logs": {
    name: "app.logs",
    description: "Stream app runtime logs.",
    scope: "app:control",
  },

  // db.*
  "db.exec": {
    name: "db.exec",
    description: "Execute SQL statements.",
    scope: "mod:database",
  },
  "db.run": {
    name: "db.run",
    description: "Run parameterized SQL statement.",
    scope: "mod:database",
  },
  "db.query": {
    name: "db.query",
    description: "Run parameterized SQL query.",
    scope: "mod:database",
  },
  "db.get": {
    name: "db.get",
    description: "Get single row result.",
    scope: "mod:database",
  },
  "db.transaction": {
    name: "db.transaction",
    description: "Execute transaction statements.",
    scope: "mod:database",
  },
  "db.stream.open": {
    name: "db.stream.open",
    description: "Open streaming cursor.",
    scope: "mod:database",
  },
  "db.stream.next": {
    name: "db.stream.next",
    description: "Fetch next chunk.",
    scope: "mod:database",
  },
  "db.stream.close": {
    name: "db.stream.close",
    description: "Close stream.",
    scope: "mod:database",
  },
  "db.ai.search": {
    name: "db.ai.search",
    description: "Execute BM25 search.",
    scope: "mod:database",
  },
  "db.ai.searchVector": {
    name: "db.ai.searchVector",
    description: "Execute cosine similarity vector search.",
    scope: "mod:database",
  },
  "db.ai.autoIndex": {
    name: "db.ai.autoIndex",
    description: "Auto-generate indexes.",
    scope: "mod:database",
  },
};

// Dynamically register mod.<module>.<action> for all 18 modules
for (const [modName, manifest] of Object.entries(INTEGRATED_MODULES)) {
  for (const action of manifest.actions) {
    const fullMethod = `mod.${modName}.${action}`;
    WSAPI_METHODS[fullMethod] = {
      name: fullMethod,
      description: `Invoke action '${action}' of module '${modName}'.`,
      scope: `mod:${modName}`,
    };
  }
}

export function generateFullSchema(): Record<string, any> {
  return {
    asyncapi: "2.6.0",
    info: {
      title: "RitaWapp wsApi Protocol",
      version: "1.0.1",
      description:
        "Realtime WebSocket JSON-RPC 2.0 API for RitaWapp desktop framework.",
    },
    methods: WSAPI_METHODS,
  };
}
