/* Generated from the shared plugin installation sources. */

// src/install-runtime.ts
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
var INSTALL_PNPM_VERSION = "11.22.0";
async function pinInstallRuntime(runtime, directory) {
  let root = path.dirname(runtime.cli);
  while (!fs.existsSync(path.join(root, "package.json"))) {
    const parent = path.dirname(root);
    if (parent === root) throw new Error("\u65E0\u6CD5\u5B9A\u4F4D\u5B89\u88C5\u5DE5\u5177\u5305\u3002");
    root = parent;
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (manifest.name !== "pnpm" || manifest.version !== runtime.version) throw new Error("\u5B89\u88C5\u5DE5\u5177\u7248\u672C\u4E0D\u4E00\u81F4\u3002");
  const target = path.join(directory, "install-runtime");
  if (fs.existsSync(target)) throw new Error("\u672C\u6B21\u5B89\u88C5\u5DE5\u5177\u76EE\u5F55\u5DF2\u5B58\u5728\u3002");
  fs.cpSync(root, target, { recursive: true, dereference: false, verbatimSymlinks: true, mode: fs.constants.COPYFILE_FICLONE });
  const pinned = { ...runtime, cli: path.join(target, path.relative(root, runtime.cli)) };
  await verifyInstallRuntime(pinned);
  return pinned;
}
function resolveInstallRuntime(owner, executable = process.execPath, nodeVersion = process.versions.node) {
  const [major, minor] = nodeVersion.split(".").map(Number);
  if (!(major > 22 || major === 22 && minor >= 13)) throw new Error("\u5F53\u524D Node.js \u7248\u672C\u4E0D\u6EE1\u8DB3\u5B89\u88C5\u8981\u6C42\uFF0822.13 \u6216\u66F4\u9AD8\uFF09\uFF0C\u672A\u4FEE\u6539\u63D2\u4EF6\u3002");
  const require2 = createRequire(path.resolve(owner, "package.json"));
  let filename;
  try {
    filename = require2.resolve("pnpm");
  } catch {
    throw new Error("\u5B89\u88C5\u5DE5\u5177\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u4F7F\u7528\u5B98\u65B9\u5B89\u88C5\u547D\u4EE4\u81EA\u52A8\u4FEE\u590D\u3002");
  }
  const manifest = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (manifest.name !== "pnpm" || manifest.version !== INSTALL_PNPM_VERSION) throw new Error("\u5B89\u88C5\u5DE5\u5177\u7248\u672C\u6821\u9A8C\u5931\u8D25\uFF0C\u672A\u4FEE\u6539\u63D2\u4EF6\u3002");
  const entry = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.pnpm;
  if (typeof entry !== "string" || path.isAbsolute(entry)) throw new Error("\u5B89\u88C5\u5DE5\u5177\u5165\u53E3\u65E0\u6548\u3002");
  const root = fs.realpathSync(path.dirname(filename)), cli = fs.realpathSync(path.resolve(root, entry));
  const relative = path.relative(root, cli);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !fs.statSync(cli).isFile()) throw new Error("\u5B89\u88C5\u5DE5\u5177\u5165\u53E3\u4E0D\u5728\u5305\u76EE\u5F55\u5185\u3002");
  return { executable: fs.realpathSync(executable), cli, version: manifest.version };
}
function verifyInstallRuntime(runtime) {
  return new Promise((resolve, reject) => {
    const child = spawn(runtime.executable, [runtime.cli, "--version"], {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, COREPACK_ENABLE_AUTO_PIN: "0", npm_config_manage_package_manager_versions: "false" }
    });
    let stdout = "", size = 0, settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("\u5B89\u88C5\u5DE5\u5177\u542F\u52A8\u8D85\u65F6\uFF0C\u672A\u4FEE\u6539\u63D2\u4EF6\u3002"));
    }, 15e3);
    child.stdout.on("data", (b) => {
      size += b.length;
      if (size > 16384) {
        child.kill();
        finish(new Error("\u5B89\u88C5\u5DE5\u5177\u54CD\u5E94\u5F02\u5E38\u3002"));
      } else stdout += b.toString();
    });
    child.stderr.on("data", () => {
    });
    child.once("error", () => finish(new Error("\u65E0\u6CD5\u542F\u52A8\u5B89\u88C5\u5DE5\u5177\uFF0C\u672A\u4FEE\u6539\u63D2\u4EF6\u3002")));
    child.once("close", (code) => finish(code === 0 && stdout.trim() === runtime.version ? void 0 : new Error("\u5B89\u88C5\u5DE5\u5177\u8FD0\u884C\u9A8C\u8BC1\u5931\u8D25\uFF0C\u672A\u4FEE\u6539\u63D2\u4EF6\u3002")));
  });
}
export {
  INSTALL_PNPM_VERSION,
  pinInstallRuntime,
  resolveInstallRuntime,
  verifyInstallRuntime
};
