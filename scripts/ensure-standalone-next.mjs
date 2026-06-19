import { createRequire } from "node:module";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const appRoot = path.resolve(import.meta.dirname, "..");
const standaloneRoot = path.join(appRoot, ".next", "standalone");
const target = path.join(standaloneRoot, "node_modules", "next");
const serverVendorChunksSource = path.join(appRoot, ".next", "server", "vendor-chunks");
const serverVendorChunksTarget = path.join(standaloneRoot, ".next", "server", "vendor-chunks");
const publicSource = path.join(appRoot, "public");
const publicTarget = path.join(standaloneRoot, "public");
const staticSource = path.join(appRoot, ".next", "static");
const staticTarget = path.join(standaloneRoot, ".next", "static");

if (!existsSync(standaloneRoot)) {
  process.exit(0);
}

const sourcePackageJson = require.resolve("next/package.json");
const source = path.dirname(sourcePackageJson);

mkdirSync(path.dirname(target), { recursive: true });
if (!existsSync(target)) {
  cpSync(source, target, { recursive: true });
  console.log(`Copied Next runtime into standalone output: ${target}`);
}

if (existsSync(serverVendorChunksSource) && !existsSync(serverVendorChunksTarget)) {
  mkdirSync(path.dirname(serverVendorChunksTarget), { recursive: true });
  cpSync(serverVendorChunksSource, serverVendorChunksTarget, { recursive: true });
  console.log(`Copied vendor chunks into standalone output: ${serverVendorChunksTarget}`);
}

if (existsSync(publicSource)) {
  mkdirSync(path.dirname(publicTarget), { recursive: true });
  cpSync(publicSource, publicTarget, { recursive: true });
  console.log(`Copied public assets into standalone output: ${publicTarget}`);
}

if (existsSync(staticSource)) {
  mkdirSync(path.dirname(staticTarget), { recursive: true });
  cpSync(staticSource, staticTarget, { recursive: true });
  console.log(`Copied static assets into standalone output: ${staticTarget}`);
}
