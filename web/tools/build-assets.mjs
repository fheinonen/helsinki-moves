import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(toolsDir, "..");
const distDir = path.resolve(webDir, "dist");

async function buildAssets() {
  await rm(distDir, { recursive: true, force: true });

  await Promise.all([
    build({
      entryPoints: [path.resolve(webDir, "scripts/app/entry.js")],
      outfile: path.resolve(distDir, "app.js"),
      bundle: true,
      minify: true,
      format: "iife",
      legalComments: "none",
      target: ["esnext"],
    }),
    build({
      entryPoints: [path.resolve(webDir, "styles/main.css")],
      outfile: path.resolve(distDir, "main.css"),
      bundle: true,
      minify: true,
      legalComments: "none",
      target: ["esnext"],
    }),
  ]);

  process.stdout.write("Built frontend bundles in web/dist\n");
}

buildAssets().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
