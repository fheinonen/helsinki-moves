import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@client": path.resolve(__dirname, "src/client"),
      "@server": path.resolve(__dirname, "src/server"),
      "@shared": path.resolve(__dirname, "src/shared"),
      "@tests": path.resolve(__dirname, "tests"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      exclude: [
        "src/**/*.d.ts",
        "src/client/main.ts",
        "src/server/services/digitransit/types.ts",
        "src/shared/contracts/**/*.ts",
        "src/shared/domain/departure.ts",
        "src/shared/domain/stop.ts",
      ],
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/**/*.ts",
        "api/health.ts",
        "api/v1/**/*.ts",
      ],
    },
  },
});
