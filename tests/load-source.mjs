import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

// Run ingestion code without a Next server. Production cache calls are no-ops;
// source requests are supplied by each test. TypeScript resolves type imports.
export function loadSource(relativePath) {
  const root = path.resolve(import.meta.dirname, "..");
  const modules = new Map();
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const loadedModule = { exports: {} };
    modules.set(filename, loadedModule);
    const nativeRequire = createRequire(filename);
    function requireSource(specifier) {
      if (specifier === "next/cache") return { cacheLife() {}, cacheTag() {} };
      if (specifier.startsWith("@/")) return load(path.join(root, `${specifier.slice(2)}.ts`));
      return nativeRequire(specifier);
    }
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename,
    });
    new Function("require", "module", "exports", outputText)(requireSource, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return load(path.join(root, relativePath));
}
