import { run } from "./Core/cli/router.ts";
export * from "./Core/api/mod.ts";

if (import.meta.main) {
  await run(Deno.args);
}
