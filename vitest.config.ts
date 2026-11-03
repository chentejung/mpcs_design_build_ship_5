import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Pure logic only (AGENTS.md → Testing): the worker's logic.ts and lib/ helpers.
export default defineConfig({
  resolve: { alias: { "@": here(".") } },
  test: { include: ["lib/**/*.test.ts", "supabase/functions/**/*.test.ts"] },
});
