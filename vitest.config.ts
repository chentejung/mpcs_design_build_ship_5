import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// AGENTS.md → Testing: pure logic (the worker's logic.ts and lib/ helpers) in Node, and UI components
// (components/**/*.test.tsx) in jsdom with React Testing Library.
export default defineConfig({
  resolve: { alias: { "@": here(".") } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "logic", include: ["lib/**/*.test.ts", "supabase/functions/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        test: {
          name: "ui",
          include: ["components/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["./test/setup-ui.ts"],
        },
      },
    ],
  },
});
