import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "tools/*/src/**/*.test.ts",
      "apps/web/src/**/*.test.ts",
      "apps/web/functions/**/*.test.ts",
    ],
  },
});
