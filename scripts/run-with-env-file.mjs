import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const appRoot = path.resolve(import.meta.dirname, "..");
const [envFileArg, ...command] = process.argv.slice(2);

if (!envFileArg || command.length === 0) {
  console.error("Usage: node scripts/run-with-env-file.mjs <env-file> <command> [...args]");
  process.exit(1);
}

const envFile = path.resolve(appRoot, envFileArg);

function parseEnvValue(rawValue) {
  const value = rawValue.trim();
  const quote = value[0];

  if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
    return value.slice(1, -1).replace(/\\n/g, "\n");
  }

  return value;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    console.error(`Environment file not found: ${filePath}`);
    process.exit(1);
  }

  const contents = readFileSync(filePath, "utf8");

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = parseEnvValue(line.slice(separatorIndex + 1));
    if (!key) continue;

    process.env[key] = value;
  }
}

loadEnvFile(envFile);

const child = spawn(command[0], command.slice(1), {
  cwd: appRoot,
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
