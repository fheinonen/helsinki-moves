export interface ViteDevServerConfig {
  host: string;
  port: number;
}

export function resolveViteDevRuntimeEnv(
  baseEnv: NodeJS.ProcessEnv,
  loadedEnv: Record<string, string>
): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    ...loadedEnv,
  };
}

const DEFAULT_VITE_DEV_HOST = "127.0.0.1";
const DEFAULT_VITE_DEV_PORT = 4173;

function parsePort(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

export function resolveViteDevServerConfig(
  env: NodeJS.ProcessEnv = process.env
): ViteDevServerConfig {
  return {
    host: env.HOST || DEFAULT_VITE_DEV_HOST,
    port: parsePort(env.PORT) || DEFAULT_VITE_DEV_PORT,
  };
}
