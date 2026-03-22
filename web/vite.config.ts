import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";
import path from "node:path";
import {
  resolveViteDevRuntimeEnv,
  resolveViteDevServerConfig,
} from "./src/shared/config/vite-dev-server";
import { app } from "./src/server/app";
import { createDevApiMiddleware } from "./src/server/dev-api-middleware";

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

function createRouteDevPlugin(): Plugin {
  const apiMiddleware = createDevApiMiddleware({ app });
  return {
    name: "create-route-dev-rewrite",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith("/api/")) {
          void apiMiddleware(req as never, res as never, next);
          return;
        }
        if (req.url === "/create") {
          req.url = "/create.html";
        }
        next();
      });
    },
  };
}

function devCspPlugin(): Plugin {
  return {
    name: "dev-csp-relax",
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; worker-src 'self' blob:; img-src 'self' data: http: https:; font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://localhost:* http://localhost:* ws://127.0.0.1:* wss://127.0.0.1:* http://127.0.0.1:*; connect-src 'self' ws://localhost:* wss://localhost:* ws://127.0.0.1:* wss://127.0.0.1:* http://localhost:* http://127.0.0.1:* https://speech.fheinonen.eu https://generativelanguage.googleapis.com"
        );
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, resolveViteDevRuntimeEnv(process.env, loadEnv(mode, __dirname, "")));

  return {
    plugins: [
      react({
        include: /src\/client\/create\/.*\.(tsx|jsx)$/,
      }),
      tailwindcss(),
      createRouteDevPlugin(),
      htmlMinifyPlugin(),
      ...(mode === "development" ? [devCspPlugin()] : []),
    ],
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
      rollupOptions: {
        input: {
          create: path.resolve(__dirname, "create.html"),
          main: path.resolve(__dirname, "index.html"),
        },
      },
      sourcemap: false,
      target: "es2022",
    },
  };
});
