import { readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const appRoot = path.resolve(import.meta.dirname, "..");
const envFile = path.join(appRoot, ".env.production");

function loadEnvFile(filePath) {
  const contents = readFileSync(filePath, "utf8");
  const lines = contents.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    process.env[key] = value;
  }
}

loadEnvFile(envFile);

process.env.APP_ENV ||= "production";
process.env.PORT ||= "3000";

const child = spawn(process.execPath, ["server.mjs"], {
  cwd: appRoot,
  stdio: "inherit",
  env: process.env
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
