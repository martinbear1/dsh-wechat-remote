/* Generated from the shared plugin installation sources. */

// src/install-profile.ts
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

// src/secure-file.ts
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname } from "node:path";
import { userInfo } from "node:os";
import { randomBytes } from "node:crypto";
function tightenPrivateFile(file) {
  try {
    chmodSync(file, 384);
  } catch {
  }
  if (process.platform !== "win32") return;
  try {
    execFileSync("icacls", [file, "/inheritance:r", "/grant:r", `${userInfo().username}:F`], {
      timeout: 5e3,
      windowsHide: true,
      stdio: "ignore"
    });
  } catch {
  }
}
function writePrivateJsonAtomic(file, value) {
  const parent = dirname(file);
  mkdirSync(parent, { recursive: true, mode: 448 });
  const temporary = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}
`, {
      encoding: "utf8",
      mode: 384,
      flag: "wx"
    });
    const fd = openSync(temporary, "r+");
    try {
      try {
        fsyncSync(fd);
      } catch {
      }
    } finally {
      closeSync(fd);
    }
    tightenPrivateFile(temporary);
    renameSync(temporary, file);
    tightenPrivateFile(file);
  } finally {
    if (existsSync(temporary)) {
      try {
        rmSync(temporary, { force: true });
      } catch {
      }
    }
  }
}

// src/install-runtime.ts
var INSTALL_PNPM_VERSION = "11.22.0";

// src/install-profile.ts
var PLUGIN_PACKAGE = "@harness-remote/dsh-wechat-remote";
function safeProfileName(value) {
  return /^[A-Za-z0-9_-]{1,80}$/.test(value);
}
var hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function assertRelocatableProfile(root) {
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const relative = path.relative(root, fs.realpathSync(file));
        if (path.isAbsolute(fs.readlinkSync(file)) || !relative || relative.startsWith("..") || path.isAbsolute(relative)) {
          throw new Error("\u63D2\u4EF6\u4F9D\u8D56\u5305\u542B\u4E0D\u53EF\u8FC1\u79FB\u7684\u94FE\u63A5\uFF0C\u672A\u4FEE\u6539\u5F53\u524D\u5B89\u88C5\u3002");
        }
      } else if (entry.isDirectory()) walk(file);
    }
  };
  walk(root);
}
function installToolPath(directory, runtime) {
  const bin = path.join(directory, "tool-bin");
  fs.mkdirSync(bin, { mode: 448 });
  const runner = path.join(bin, "pnpm-run.cjs");
  fs.writeFileSync(runner, `require('node:child_process').spawnSync(${JSON.stringify(runtime.executable)},[${JSON.stringify(runtime.cli)},...process.argv.slice(2)],{stdio:'inherit',shell:false,windowsHide:true}).status===0?process.exit(0):process.exit(1)
`, { mode: 384 });
  if (process.platform === "win32") {
    if (/["\r\n]/.test(runtime.executable)) throw new Error("Node \u5B89\u88C5\u8DEF\u5F84\u4E0D\u53D7\u652F\u6301\u3002");
    fs.writeFileSync(path.join(bin, "pnpm.cmd"), `@echo off\r
"${runtime.executable.replace(/%/g, "%%")}" "%~dp0pnpm-run.cjs" %*\r
`, { mode: 448 });
  } else {
    const quote = (s) => "'" + s.replace(/'/g, `'"'"'`) + "'";
    fs.writeFileSync(path.join(bin, "pnpm"), `#!/bin/sh
exec ${quote(runtime.executable)} ${quote(runner)} "$@"
`, { mode: 448 });
  }
  return bin;
}
function runNativePlugin(cli, profile, home, toolPath, runtime, logFile) {
  if (!safeProfileName(profile)) throw new Error("\u65E0\u6548\u7684 DSH profile \u540D\u79F0\u3002");
  return new Promise((resolve, reject) => {
    const log = fs.openSync(logFile, "a", 384);
    const child = spawn(runtime.executable, [
      cli,
      "plugin",
      "--profile",
      profile,
      "add",
      "file:harness-remote-update.tgz",
      "--ignore-scripts",
      "--config.frozen-lockfile=false",
      "--prefer-offline",
      "--config.manage-package-manager-versions=false",
      "--reporter=append-only"
    ], {
      cwd: home,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", log, log],
      env: {
        ...process.env,
        DSH_HOME: home,
        PATH: toolPath + path.delimiter + (process.env.PATH || ""),
        CI: "true",
        COREPACK_ENABLE_AUTO_PIN: "0",
        npm_config_manage_package_manager_versions: "false"
      }
    });
    fs.closeSync(log);
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("\u4E0B\u8F7D\u6216\u5B89\u88C5\u8D85\u65F6\uFF0C\u539F\u63D2\u4EF6\u672A\u66FF\u6362\u3002"));
    }, 24e4);
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("\u65E0\u6CD5\u542F\u52A8 DSH \u539F\u751F\u5B89\u88C5\u7A0B\u5E8F\u3002"));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error("\u5B89\u88C5\u672A\u5B8C\u6210\uFF0C\u539F\u63D2\u4EF6\u672A\u66FF\u6362\uFF1B\u8BE6\u60C5\u5DF2\u4FDD\u7559\u5728\u672C\u673A\u5B89\u88C5\u65E5\u5FD7\u3002"));
    });
  });
}
async function stageProfile(job) {
  const scope = path.basename(job.profile);
  if (!safeProfileName(scope) || !fs.statSync(job.directory).isDirectory()) throw new Error("\u5B89\u88C5\u76EE\u6807\u4E0D\u660E\u786E\u3002");
  const stagingHome = path.join(job.directory, "staging-home"), staged = path.join(stagingHome, "profiles", scope);
  fs.mkdirSync(staged, { recursive: true, mode: 448 });
  if (fs.existsSync(job.profile)) {
    if (fs.lstatSync(job.profile).isSymbolicLink() || fs.realpathSync(job.profile) !== path.resolve(job.profile)) throw new Error("\u4E0D\u652F\u6301\u81EA\u52A8\u66FF\u6362\u94FE\u63A5\u5F62\u5F0F\u7684 profile\u3002");
    fs.cpSync(job.profile, staged, {
      recursive: true,
      dereference: false,
      filter: (p) => !["node_modules", ".harness-remote-update.lock"].includes(path.basename(p))
    });
  }
  let before = null;
  const filename = path.join(staged, "package.json");
  if (fs.existsSync(filename)) {
    before = JSON.parse(fs.readFileSync(filename, "utf8"));
    for (const [name, spec] of Object.entries(before.dependencies || {})) {
      if (name !== PLUGIN_PACKAGE && !/^[~^]?\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(String(spec))) throw new Error("\u5176\u4ED6\u63D2\u4EF6\u4F7F\u7528\u4E86\u672C\u5730\u94FE\u63A5\u6216\u7279\u6B8A\u6765\u6E90\uFF0C\u672A\u4FEE\u6539\u5F53\u524D\u5B89\u88C5\u3002");
    }
    for (const e of fs.readdirSync(staged, { withFileTypes: true })) if (e.isSymbolicLink()) throw new Error("profile \u914D\u7F6E\u5305\u542B\u94FE\u63A5\uFF0C\u672A\u4FEE\u6539\u5F53\u524D\u5B89\u88C5\u3002");
    if (before.packageManager && !/^pnpm@\d+\.\d+\.\d+(?:\+.*)?$/.test(before.packageManager)) throw new Error("\u5F53\u524D profile \u4F7F\u7528\u4E86\u5176\u4ED6\u5305\u7BA1\u7406\u5668\uFF0C\u672A\u4FEE\u6539\u5B89\u88C5\u3002");
    writePrivateJsonAtomic(filename, { ...before, dependencies: {
      ...before.dependencies,
      [PLUGIN_PACKAGE]: "file:harness-remote-update.tgz"
    }, packageManager: `pnpm@${INSTALL_PNPM_VERSION}` });
  }
  fs.copyFileSync(path.join(job.directory, "release.tgz"), path.join(staged, "harness-remote-update.tgz"));
  const tools = installToolPath(job.directory, job.runtime);
  await runNativePlugin(job.cli, scope, stagingHome, tools, job.runtime, path.join(job.directory, "install.log"));
  const installed = fs.realpathSync(path.join(staged, "node_modules", PLUGIN_PACKAGE));
  const relative = path.relative(staged, installed);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("\u6682\u5B58\u63D2\u4EF6\u4E0D\u5728\u5B89\u88C5\u76EE\u5F55\u5185\u3002");
  if (JSON.parse(fs.readFileSync(path.join(installed, "package.json"), "utf8")).version !== job.targetVersion) throw new Error("\u5B89\u88C5\u540E\u63D2\u4EF6\u7248\u672C\u4E0D\u5339\u914D\u3002");
  const after = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (!after.dsh?.profile?.bundles?.includes(PLUGIN_PACKAGE)) throw new Error("DSH \u5C1A\u672A\u5C06\u63D2\u4EF6\u6CE8\u518C\u4E3A\u539F\u751F profile \u5C42\u3002");
  for (const name of Object.keys(before?.dependencies || {})) if (name !== PLUGIN_PACKAGE) {
    if (hash(path.join(job.profile, "node_modules", name, "package.json")) !== hash(path.join(staged, "node_modules", name, "package.json"))) throw new Error("\u5B89\u88C5\u8BD5\u56FE\u6539\u53D8\u5176\u4ED6\u63D2\u4EF6\uFF0C\u539F\u5B89\u88C5\u4FDD\u6301\u4E0D\u53D8\u3002");
  }
  assertRelocatableProfile(staged);
  return staged;
}
export {
  PLUGIN_PACKAGE,
  assertRelocatableProfile,
  installToolPath,
  runNativePlugin,
  safeProfileName,
  stageProfile
};
