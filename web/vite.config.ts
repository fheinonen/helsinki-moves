import { defineConfig } from "vite";
import path from "node:path";
import { resolveViteDevServerConfig } from "./src/shared/config/vite-dev-server";

const devServer = resolveViteDevServerConfig();

export default defineConfig({
  resolve: {
    alias: {
      "@client": path.resolve(__dirname, "src/client"),
      "@server": path.resolve(__dirname, "src/server"),
      "@shared": path.resolve(__dirname, "src/shared"),
      "@tests": path.resolve(__dirname, "tests"),
    },
  },
  server: {
    host: devServer.host,
    port: devServer.port,
  },
  preview: {
    host: devServer.host,
    port: 4173,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
  },
});
