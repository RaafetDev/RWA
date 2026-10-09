/**
 * ============================================================================
 * Core/toolchain/compile_vue.ts
 * ============================================================================
 * Pure Deno Standalone Vue 3 SFC & TypeScript In-Memory Bundler
 * Compiles src/App.vue, Vue components, and RitaWapp TypeScript frontend
 * into standalone, production-ready dist/index.html with zero external npm dependencies.
 * ============================================================================
 */

import { dirname, join, relative } from "jsr:@std/path@1.0.9";
import { getFrameworkRoot } from "./paths.ts";
import { logger } from "../cli/logger.ts";

// Import vendored compilers directly in Deno
// @ts-ignore: Vendored standalone CJS/ESM modules
import * as sfc from "./vendor/compiler_sfc.js";
// @ts-ignore: Vendored standalone CJS/ESM modules
import * as sucrase from "./vendor/sucrase.js";

export interface CompileVueOptions {
  projectDir: string;
}

export async function compileVueProject(projectDir: string): Promise<string> {
  const frameworkRoot = getFrameworkRoot();
  const vueRuntimePath = join(
    frameworkRoot,
    "Core",
    "toolchain",
    "vendor",
    "vue.esm-browser.js",
  );
  const vueRuntimeJs = await Deno.readTextFile(vueRuntimePath);

  const srcDir = join(projectDir, "src");
  const appVuePath = join(srcDir, "App.vue");

  let appVueContent = "";
  try {
    appVueContent = await Deno.readTextFile(appVuePath);
  } catch {
    throw new Error(`Vue entrypoint not found at ${appVuePath}`);
  }

  // 1. Compile Subcomponents in src/ (if any)
  const subComponentsCode: string[] = [];
  const styles: string[] = [];

  for await (const entry of walkFiles(srcDir)) {
    if (entry.endsWith(".vue") && entry !== appVuePath) {
      try {
        const compCode = await Deno.readTextFile(entry);
        const relPath = relative(srcDir, entry).replaceAll("\\", "/");
        const compId = relPath.replace(/\.vue$/, "").replace(/[^a-zA-Z0-9_]/g, "_");
        const compiledComp = compileSingleVueFile(compCode, compId, relPath);
        subComponentsCode.push(compiledComp.js);
        if (compiledComp.css) styles.push(compiledComp.css);
      } catch (err: unknown) {
        logger.warn(`Failed to compile Vue component ${entry}: ${(err as Error).message}`);
      }
    }
  }

  // 2. Compile main App.vue
  const compiledApp = compileSingleVueFile(appVueContent, "app_root", "App.vue");
  if (compiledApp.css) styles.push(compiledApp.css);

  // 3. Compile ritawapp.modules.ts
  const modulesTsPath = join(srcDir, "ritawapp.modules.ts");
  let modulesJs = "";
  try {
    const modulesTs = await Deno.readTextFile(modulesTsPath);
    const transformed = (sucrase as any).transform(modulesTs, {
      transforms: ["typescript"],
    });
    modulesJs = transformed.code;
  } catch {
    modulesJs = "export const enabledModules = {}; export const isAssetsMod = false; export const isModuleEnabled = () => true;";
  }

  // 4. Compile RitaWapp.ts
  const ritaWappTsPath = join(srcDir, "RitaWapp.ts");
  let ritaWappJs = "";
  try {
    const ritaWappTs = await Deno.readTextFile(ritaWappTsPath);
    // Replace import of ritawapp.modules with relative import for the browser bundle
    const sanitizedTs = ritaWappTs.replace(
      /from\s+["']\.\/ritawapp\.modules(?:\.ts)?["']/g,
      `from "./ritawapp.modules.js"`,
    );
    const transformed = (sucrase as any).transform(sanitizedTs, {
      transforms: ["typescript"],
    });
    ritaWappJs = transformed.code;
  } catch (err: unknown) {
    logger.warn(`Failed to transpile RitaWapp.ts: ${(err as Error).message}`);
  }

  // 5. Build dist directory structure
  const distDir = join(projectDir, "dist");
  await Deno.mkdir(distDir, { recursive: true });

  // Copy app.ico from public or template if present
  try {
    const icoSrc = join(projectDir, "public", "app.ico");
    await Deno.copyFile(icoSrc, join(distDir, "app.ico"));
  } catch {}

  // Write bundle JS files into dist/
  await Deno.writeTextFile(join(distDir, "vue.esm-browser.js"), vueRuntimeJs);
  await Deno.writeTextFile(join(distDir, "ritawapp.modules.js"), modulesJs);
  await Deno.writeTextFile(join(distDir, "RitaWapp.js"), ritaWappJs);

  // 6. Assemble App.js
  let appBundleJs = `
import * as Vue from "./vue.esm-browser.js";
import { RitaWapp } from "./RitaWapp.js";

${subComponentsCode.join("\n\n")}

${compiledApp.js}

// Bootstrap Vue 3 Application
const app = Vue.createApp(__sfc__);
app.use(RitaWapp);
app.mount("#app");
`;

  // Fix bare "vue" imports inside components to point to ./vue.esm-browser.js
  appBundleJs = appBundleJs.replace(
    /from\s+["']vue["']/g,
    `from "./vue.esm-browser.js"`,
  );

  await Deno.writeTextFile(join(distDir, "app.bundle.js"), appBundleJs);

  // 7. Assemble 100% Self-Contained Inlined Scripts (Zero Data URIs, Zero CORS issues)
  const globalVueJs = vueRuntimeJs.replace(
    /export\s*\{([^}]+)\}/,
    (_, body) => {
      const converted = body.replace(
        /([a-zA-Z0-9_$]+)\s+as\s+([a-zA-Z0-9_$]+)/g,
        "$2: $1",
      );
      return `const Vue = { ${converted} };\nglobalThis.Vue = Vue;\nif (typeof window !== "undefined") window.Vue = Vue;`;
    },
  );

  const globalModulesJs = modulesJs
    .replace(/export\s+const\s+/g, "const ")
    .replace(/export\s+function\s+/g, "function ")
    .replace(/export\s+\{[^}]+\};?/g, "") + `
window.__RWA_MODULES__ = {
  enabledModules: typeof enabledModules !== "undefined" ? enabledModules : {},
  isAssetsMod: typeof isAssetsMod !== "undefined" ? isAssetsMod : false,
  isModuleEnabled: typeof isModuleEnabled !== "undefined" ? isModuleEnabled : () => true,
  getAssetUrl: typeof getAssetUrl !== "undefined" ? getAssetUrl : (p) => p,
};
`;

  const globalRitaJs = ritaWappJs
    .replace(/import\s*\{[^}]*\}\s*from\s*["'][^"']*ritawapp\.modules[^"']*["'];?/g, `
const { enabledModules, isAssetsMod, isModuleEnabled, getAssetUrl } = (window.__RWA_MODULES__ || {});
`)
    .replace(/import\s*\{[^}]*\}\s*from\s*["']vue["'];?/g, `
const { createApp, ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } = (window.Vue || {});
`)
    .replace(/export\s+const\s+RitaWapp\s*=/g, "const RitaWapp =")
    .replace(/export\s+default\s+RitaWapp;?/g, "")
    .replace(/export\s*\{[^}]*\};?/g, "") + `
window.RitaWapp = typeof RitaWapp !== "undefined" ? RitaWapp : { install() {} };
`;

  const cleanAppJs = compiledApp.js
    .replace(/import\s*\{([^}]*)\}\s*from\s*["']vue["'];?/g, "const { $1 } = window.Vue;")
    .replace(/import\s*\*\s*as\s+(\w+)\s+from\s*["']vue["'];?/g, "const $1 = window.Vue;")
    .replace(/import\s*\{[^}]*\}\s*from\s*["'][^"']*RitaWapp[^"']*["'];?/g, "")
    .replace(/import\s*\{[^}]*\}\s*from\s*["'][^"']*ritawapp\.modules[^"']*["'];?/g, "");

  const cleanSubComponents = subComponentsCode
    .map((c) =>
      c
        .replace(/import\s*\{([^}]*)\}\s*from\s*["']vue["'];?/g, "const { $1 } = window.Vue;")
        .replace(/import\s*\*\s*as\s+(\w+)\s+from\s*["']vue["'];?/g, "const $1 = window.Vue;")
        .replace(/import\s*\{[^}]*\}\s*from\s*["'][^"']*RitaWapp[^"']*["'];?/g, "")
    )
    .join("\n\n");

  // 8. Assemble dist/index.html
  const allCss = styles.join("\n\n");
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>RitaWapp Desktop</title>
  <link rel="icon" type="image/x-icon" href="/app.ico" />
  <script src="/webui.js"></script>
  <style>
${allCss}
  </style>
</head>
<body>
  <div id="app" data-testid="ritawapp-app-root"></div>
  <script>
${globalVueJs}

${globalModulesJs}

${globalRitaJs}

${cleanSubComponents}

${cleanAppJs}

// Bootstrap Vue 3 Application
const app = window.Vue.createApp(__sfc__);
app.use(window.RitaWapp);
app.mount("#app");
  </script>
</body>
</html>
`;

  const distHtmlPath = join(distDir, "index.html");
  await Deno.writeTextFile(distHtmlPath, htmlContent);

  logger.debug(`[VueCompiler] Successfully compiled ${appVuePath} -> ${distHtmlPath}`);
  return distHtmlPath;
}

function compileSingleVueFile(
  vueContent: string,
  scopeId: string,
  filename: string,
): { js: string; css: string } {
  const parsed = (sfc as any).parse(vueContent);
  const descriptor = parsed.descriptor;

  let scriptCode = "";
  if (descriptor.script || descriptor.scriptSetup) {
    const compiledScript = (sfc as any).compileScript(descriptor, {
      id: scopeId,
      inlineTemplate: true,
    });
    scriptCode = compiledScript.content;
  } else if (descriptor.template) {
    const compiledTemplate = (sfc as any).compileTemplate({
      id: scopeId,
      source: descriptor.template.content,
      filename,
    });
    scriptCode = `${compiledTemplate.code}\nexport default { render };`;
  }

  // Strip TypeScript types with sucrase
  const transformed = (sucrase as any).transform(scriptCode, {
    transforms: ["typescript"],
  });

  // Rewrite "export default" to a local variable declaration
  const componentVarName = scopeId === "app_root" ? "__sfc__" : `__comp_${scopeId}`;
  const rewrittenJs = (sfc as any).rewriteDefault(transformed.code, componentVarName);

  // Collect CSS
  const css = descriptor.styles.map((s: any) => s.content).join("\n");

  return {
    js: rewrittenJs,
    css,
  };
}

async function* walkFiles(dir: string): AsyncIterable<string> {
  try {
    for await (const entry of Deno.readDir(dir)) {
      const full = join(dir, entry.name);
      if (entry.isDirectory) {
        yield* walkFiles(full);
      } else if (entry.isFile) {
        yield full;
      }
    }
  } catch {}
}
