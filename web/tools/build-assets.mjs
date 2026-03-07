import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(toolsDir, "..");
const distDir = path.resolve(webDir, "dist");

function resolveTailwindCliModulePath() {
  const packageJsonPath = require.resolve("@tailwindcss/cli/package.json");
  const packageJson = require(packageJsonPath);
  const binPath =
    typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin?.tailwindcss;
  if (!binPath) {
    throw new Error("Could not resolve @tailwindcss/cli bin path");
  }
  return path.resolve(path.dirname(packageJsonPath), binPath);
}

export function getTailwindCliInvocation(_platform = process.platform) {
  return {
    command: process.execPath,
    args: [
      resolveTailwindCliModulePath(),
      "-i",
      "styles/main.css",
      "-o",
      "dist/.tailwind-intermediate.css",
    ],
  };
}

export async function buildAssets() {
  await rm(distDir, { recursive: true, force: true });

  // Step 1: Tailwind CLI processes main.css → intermediate file
  const tailwindCli = getTailwindCliInvocation();
  execFileSync(tailwindCli.command, tailwindCli.args, { cwd: webDir, stdio: "inherit" });

  // Step 2: esbuild bundles JS + Tailwind-processed CSS in parallel
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
      entryPoints: [path.resolve(distDir, ".tailwind-intermediate.css")],
      outfile: path.resolve(distDir, "main.css"),
      bundle: true,
      minify: true,
      legalComments: "none",
      target: ["esnext"],
    }),
  ]);

  process.stdout.write("Built frontend bundles in web/dist\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildAssets().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
