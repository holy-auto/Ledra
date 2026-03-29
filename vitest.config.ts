import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/lib/__tests__/setup.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/lib/**/*.ts", "src/components/**/*.tsx"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/__tests__/**"],
      thresholds: {
        statements: 50,
        branches: 40,
        functions: 40,
        lines: 50,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
