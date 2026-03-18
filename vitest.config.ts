import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/lib/__tests__/setup.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
