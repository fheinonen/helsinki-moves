import { defineConfig, type Plugin } from "vite";
import path from "node:path";
import { resolveViteDevServerConfig } from "./src/shared/config/vite-dev-server";

const devServer = resolveViteDevServerConfig();

function minifyHtml(html: string): string {
  return html
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function htmlMinifyPlugin(): Plugin {
  return {
    name: "html-minify",
    generateBundle(_, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === "asset" && chunk.fileName.endsWith(".html") && typeof chunk.source === "string") {
          chunk.source = minifyHtml(chunk.source);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [htmlMinifyPlugin()],
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
    sourcemap: false,
    target: "es2022",
  },
});
