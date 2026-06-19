import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const port = process.env.PORT || "3000";
const nodeBin = process.execPath;
const nextBin = process.platform === "win32" ? "next.cmd" : "next";
const standaloneServer = path.join(process.cwd(), ".next", "standalone", "server.js");

const command = existsSync(standaloneServer)
  ? { bin: nodeBin, args: [standaloneServer] }
  : { bin: nextBin, args: ["start", "-H", "0.0.0.0", "-p", port] };

const server = spawn(command.bin, command.args, {
  stdio: "inherit",
  shell: existsSync(standaloneServer) ? false : process.platform === "win32"
});

server.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
