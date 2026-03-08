import fs from "node:fs";
import path from "node:path";

const REQUIRED_RELEASE_ENV_VARS = [
  "DIGITRANSIT_API_KEY",
  "SPEECH_TRANSCRIBE_API_KEY",
  "SPEECH_TRANSCRIBE_MODEL",
];

const OPTIONAL_RELEASE_ENV_VARS = [
  "SPEECH_TRANSCRIBE_API_URL",
  "SPEECH_TRANSCRIBE_LANGUAGE",
  "OPENAI_API_KEY",
];

function hasValue(value) {
  return String(value || "").trim().length > 0;
}

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const parsed = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    parsed[key] = value;
  }

  return parsed;
}

const env = {
  ...readDotEnv(path.resolve(process.cwd(), ".env")),
  ...process.env,
};

const missingRequired = REQUIRED_RELEASE_ENV_VARS.filter(
  (name) => !hasValue(env[name])
);
const optionalUnset = OPTIONAL_RELEASE_ENV_VARS.filter(
  (name) => !hasValue(env[name])
);

if (missingRequired.length > 0) {
  for (const name of missingRequired) {
    process.stderr.write(`Missing required env var: ${name}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write("Required runtime env vars are set.\n");
}

if (optionalUnset.length > 0) {
  process.stdout.write(`Optional env vars not set: ${optionalUnset.join(", ")}\n`);
}
