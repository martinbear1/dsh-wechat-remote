/* Generated from the shared plugin installation sources. */

// src/update-worker.ts
import fs3 from "node:fs";
import path3 from "node:path";
import http from "node:http";
import { spawn as spawn3 } from "node:child_process";
import { createHash as createHash2, createPublicKey } from "node:crypto";
import { fileURLToPath } from "node:url";

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

// src/install-profile.ts
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

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

// src/install-lifecycle.ts
import fs2 from "node:fs";
import path2 from "node:path";
import { execFileSync as execFileSync2, spawn as spawn2 } from "node:child_process";
var serviceName = (s) => /^[A-Za-z0-9_.@-]{1,180}$/.test(s);
function run(command, args) {
  return execFileSync2(command, args, { encoding: "utf8", windowsHide: true, timeout: 15e3, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function validateManager(value) {
  if (value.kind === "process") return;
  if (value.kind === "systemd" && process.platform === "linux" && serviceName(value.unit) && value.unit.endsWith(".service")) return;
  if (value.kind === "launchd" && process.platform === "darwin" && serviceName(value.label) && /^gui\/\d+$/.test(value.domain) && value.domain === `gui/${process.getuid?.()}` && path2.isAbsolute(value.plist) && fs2.statSync(value.plist).isFile()) return;
  throw new Error("\u65E0\u6CD5\u786E\u8BA4\u539F\u540E\u53F0\u670D\u52A1\uFF0C\u672A\u505C\u6B62 DSH\u3002");
}
function stopManagedHost(manager) {
  validateManager(manager);
  if (manager.kind === "systemd") run("systemctl", ["--user", "stop", manager.unit]);
  else if (manager.kind === "launchd") run("/bin/launchctl", ["bootout", `${manager.domain}/${manager.label}`]);
  else throw new Error("\u666E\u901A DSH \u8FDB\u7A0B\u5FC5\u987B\u7531\u5176\u542F\u52A8\u63E1\u624B\u505C\u6B62\u3002");
}
function startManagedHost(manager) {
  validateManager(manager);
  if (manager.kind === "systemd") run("systemctl", ["--user", "start", manager.unit]);
  else if (manager.kind === "launchd") run("/bin/launchctl", ["bootstrap", manager.domain, manager.plist]);
  else throw new Error("\u666E\u901A DSH \u8FDB\u7A0B\u5FC5\u987B\u7531\u539F\u73AF\u5883\u542F\u52A8\u3002");
}

// src/update-worker.ts
function releaseOwnedUpdateLock(lock, id) {
  try {
    if (fs3.readFileSync(lock, "utf8") === id) fs3.unlinkSync(lock);
  } catch {
  }
}
var wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var hashFile = (f) => createHash2("sha256").update(fs3.readFileSync(f)).digest("hex");
function within(parent, child) {
  const relative = path3.relative(parent, child);
  return Boolean(relative) && !relative.startsWith("..") && !path3.isAbsolute(relative);
}
function safePlainDirectory(p) {
  if (!fs3.statSync(p).isDirectory() || fs3.lstatSync(p).isSymbolicLink() || fs3.realpathSync(p) !== path3.resolve(p)) throw new Error("\u5B89\u88C5\u76EE\u5F55\u4E0D\u662F\u53EF\u5B89\u5168\u66FF\u6362\u7684\u72EC\u7ACB\u76EE\u5F55");
}
function validateJob(job) {
  if (!/^[a-f0-9]{32}$/.test(job.id) || path3.basename(job.directory) !== job.id || !within(path3.join(job.home, "harness-remote-updates"), job.directory) || !within(path3.join(job.home, "profiles"), job.profile) || path3.dirname(job.profile) !== path3.join(job.home, "profiles") || !within(job.home, job.stateFile) || !Number.isInteger(job.parentPid) || job.parentPid < 1 || ![job.webPort, job.gatePort, job.localPort].every((p) => Number.isInteger(p) && p > 0 && p <= 65535) || !job.argv.includes(job.cli) || !job.argv.includes("web") || !/^[\w.+-]{1,80}$/.test(job.targetVersion)) throw new Error("\u66F4\u65B0\u4EFB\u52A1\u8303\u56F4\u6821\u9A8C\u5931\u8D25");
  safePlainDirectory(job.profile);
  safePlainDirectory(job.directory);
  if (job.identityFile && !within(job.home, job.identityFile)) throw new Error("\u8282\u70B9\u8EAB\u4EFD\u6587\u4EF6\u4E0D\u5C5E\u4E8E\u5F53\u524D DSH");
  if (job.controlOrigin) {
    const u = new URL(job.controlOrigin);
    if (u.protocol !== "http:" || u.hostname !== "127.0.0.1" || !u.port || u.username || u.password || u.pathname !== "/" || u.search || u.hash) throw new Error("\u5B89\u88C5\u63A7\u5236\u5730\u5740\u65E0\u6548");
    validateManager(job.manager);
  }
  for (const f of [job.executable, job.cli, job.pnpm, ...job.previousVersion === "0.0.0" ? [] : [job.stateFile]]) if (!fs3.statSync(f).isFile()) throw new Error("\u5B89\u88C5\u8FD0\u884C\u65F6\u5DF2\u53D8\u5316");
}
async function control(job, operation, input = {}) {
  let res;
  for (let attempt = 0; attempt < (operation === "describe" ? 3 : 1); attempt++) {
    try {
      res = await fetch(job.controlOrigin + "/" + operation, { method: "POST", headers: {
        authorization: `Bearer ${job.statusToken}`,
        "content-type": "application/json",
        connection: "close"
      }, body: JSON.stringify(input), signal: AbortSignal.timeout(operation === "quiesce" ? 2e4 : 12e3), redirect: "error" });
      break;
    } catch (error) {
      if (operation !== "describe" || attempt === 2) throw new Error(`\u5B89\u88C5\u63A7\u5236 ${operation} \u672A\u5B8C\u6210`, { cause: error });
      await wait(150);
    }
  }
  if (!res) throw new Error("\u5B89\u88C5\u63A7\u5236\u901A\u9053\u672A\u54CD\u5E94");
  const value = await res.json();
  if (!res.ok) throw new Error(value.error || "\u65E0\u6CD5\u786E\u8BA4\u5F53\u524D\u4E3B\u673A\u72B6\u6001");
  return value;
}
async function beforeRpc(job, method, payload = {}) {
  return job.controlOrigin ? control(job, "read", { method, payload }) : rpc(job, method, payload);
}
async function rpc(job, method, payload = {}, deadline) {
  const state = JSON.parse(fs3.readFileSync(job.stateFile, "utf8"));
  const res = await fetch(`http://127.0.0.1:${job.gatePort}/api/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${state.token}`, "content-type": "application/json", "x-harness-update-probe": job.statusToken },
    body: JSON.stringify({ type: "client-request", rpcId: "plugin-update-check", method, payload }),
    signal: deadline ? AbortSignal.any([deadline, AbortSignal.timeout(5e3)]) : AbortSignal.timeout(5e3),
    redirect: "error"
  });
  const body = await res.json();
  if (!res.ok || !body.result?.ok) throw new Error("\u4E3B\u673A\u4F1A\u8BDD\u670D\u52A1\u672A\u5C31\u7EEA");
  return body.result.value;
}
function durableSnapshot(job) {
  const result = {};
  const walk = (dir) => {
    if (!fs3.existsSync(dir)) return;
    for (const e of fs3.readdirSync(dir, { withFileTypes: true })) {
      const file = path3.join(dir, e.name);
      if (e.isSymbolicLink()) throw new Error("\u53D7\u4FDD\u62A4\u7684\u6570\u636E\u76EE\u5F55\u542B\u94FE\u63A5\uFF0C\u9700\u624B\u5DE5\u66F4\u65B0");
      if (e.isDirectory()) walk(file);
      else if (e.isFile()) result[path3.relative(job.home, file)] = hashFile(file);
    }
  };
  walk(path3.join(job.home, "sessions"));
  walk(path3.join(job.home, "attachments"));
  walk(path3.join(job.home, "harness-remote"));
  for (const e of fs3.readdirSync(job.home, { withFileTypes: true })) {
    if (e.isFile() && /(?:identity|settings|credentials|public|gate-wechat)/i.test(e.name) && !e.name.endsWith(".log")) {
      const f = path3.join(job.home, e.name);
      if (f === job.stateFile) continue;
      result[e.name] = hashFile(f);
    }
  }
  if (fs3.existsSync(job.stateFile)) {
    const state = JSON.parse(fs3.readFileSync(job.stateFile, "utf8"));
    result["$binding"] = createHash2("sha256").update(JSON.stringify([state.token, state.wechatBindings])).digest("hex");
  }
  return result;
}
function assertPreserved(before, after) {
  for (const [key, hash2] of Object.entries(before)) if (after[key] !== hash2) throw new Error("\u5347\u7EA7\u540E\u6570\u636E\u6821\u9A8C\u4E0D\u4E00\u81F4\uFF1B\u505C\u6B62\u81EA\u52A8\u64CD\u4F5C\u5E76\u4FDD\u7559\u5907\u4EFD");
}
function migrateLegacyGrantOwner(job) {
  if (job.previousVersion !== "1.5.5" || !job.identityFile || !fs3.existsSync(job.identityFile)) return;
  const state = JSON.parse(fs3.readFileSync(job.stateFile, "utf8"));
  if (state.publicIdentityNodeId) return;
  const identity = JSON.parse(fs3.readFileSync(job.identityFile, "utf8"));
  const publicKey = createPublicKey(identity.privateKeyPem).export({ format: "der", type: "spki" });
  const savedKey = createPublicKey(identity.publicKeyPem).export({ format: "der", type: "spki" });
  const nodeId = createHash2("sha256").update(publicKey).digest().subarray(0, 18).toString("base64url");
  if (!publicKey.equals(savedKey) || identity.nodeId !== nodeId) throw new Error("\u65E7\u8282\u70B9\u8EAB\u4EFD\u6821\u9A8C\u672A\u901A\u8FC7\uFF0C\u672A\u8FC1\u79FB\u914D\u5BF9");
  writePrivateJsonAtomic(job.stateFile, { ...state, publicIdentityNodeId: nodeId });
}
async function describe(job, deadline) {
  const value = await rpc(job, "wechatHost/describe", { args: { request: {} } }, deadline);
  if (!value?.ok || value.value.agentVersion !== job.dshVersion) throw new Error("DSH \u7248\u672C\u6216\u63CF\u8FF0\u670D\u52A1\u4E0D\u5339\u914D");
  return value.value;
}
async function healthy(job, version, timeoutMs = 6e4) {
  const deadline = AbortSignal.timeout(timeoutMs);
  while (!deadline.aborted) {
    try {
      if ((await describe(job, deadline)).pluginVersion === version) {
        const list = await rpc(job, "session.list", {}, deadline);
        if (Array.isArray(list.items)) return;
      }
    } catch {
    }
    if (!deadline.aborted) await wait(Math.min(500, timeoutMs));
  }
  throw new Error("\u91CD\u542F\u5065\u5EB7\u68C0\u67E5\u672A\u901A\u8FC7");
}
async function verifyFence(job) {
  for (const port of [job.webPort, job.gatePort, job.localPort]) {
    const res = await fetch(`http://127.0.0.1:${port}/gate/status`, { signal: AbortSignal.timeout(5e3), redirect: "error" });
    await res.arrayBuffer();
    if (res.status !== 503) throw new Error("\u65B0\u63D2\u4EF6\u672A\u4FDD\u6301\u91CD\u542F\u9A8C\u8BC1\u4FDD\u62A4\uFF0C\u4E0D\u80FD\u786E\u8BA4\u5B89\u5168\u66F4\u65B0");
  }
}
function start(job) {
  if (job.manager && job.manager.kind !== "process") {
    startManagedHost(job.manager);
    return;
  }
  const log = fs3.openSync(path3.join(job.directory, "restart.log"), "a", 384);
  const child = spawn3(job.executable, [...job.execArgv, ...job.argv], {
    cwd: job.cwd,
    env: { ...process.env, HARNESS_REMOTE_UPDATE_JOB: job.directory },
    stdio: ["ignore", log, log],
    detached: true,
    windowsHide: true
  });
  fs3.closeSync(log);
  child.on("error", () => {
  });
  child.unref();
  if (!child.pid) throw new Error("\u65E0\u6CD5\u542F\u52A8\u539F DSH \u547D\u4EE4");
  writePrivateJsonAtomic(path3.join(job.directory, "restarted-process.json"), { pid: child.pid, cli: job.cli, home: job.home, webPort: job.webPort });
  return child;
}
async function stopOriginal(job) {
  if (!job.controlOrigin) {
    if (process.connected !== true || process.ppid !== job.parentPid) throw new Error("\u542F\u52A8\u8EAB\u4EFD\u5DF2\u53D8\u5316\uFF0C\u672A\u505C\u6B62 DSH");
    await stopChild(job.parentPid);
    return;
  }
  const host = await control(job, "describe");
  if (host.pid !== job.parentPid || host.cli !== job.cli || host.profile !== job.profile) throw new Error("\u5F53\u524D DSH \u8EAB\u4EFD\u5DF2\u53D8\u5316");
  if (job.manager && job.manager.kind !== "process") stopManagedHost(job.manager);
  else await control(job, "shutdown");
  for (let i = 0; i < 150; i++) {
    try {
      process.kill(job.parentPid, 0);
    } catch {
      return;
    }
    await wait(100);
  }
  throw new Error("\u539F DSH \u5C1A\u672A\u7ED3\u675F\uFF0C\u672A\u66FF\u6362\u63D2\u4EF6");
}
async function stopRestarted(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await wait(100);
  }
  throw new Error("\u66F4\u65B0\u540E\u7684 DSH \u672A\u6309\u65F6\u505C\u6B62");
}
async function stopChild(pid) {
  process.kill(pid, "SIGTERM");
  for (let i = 0; i < 100; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await wait(100);
  }
  throw new Error("DSH \u672A\u6309\u65F6\u505C\u6B62\uFF0C\u4E0D\u5F3A\u5236\u7EC8\u6B62\u5176\u4ED6\u8FDB\u7A0B");
}
async function executeUpdate(job, progress, quiesce) {
  validateJob(job);
  let staged = "";
  const previous = path3.join(job.directory, "profile-before");
  const emit = (phase, n, message) => progress({ phase, progress: n, message, terminal: false });
  let stopped = false, disposed = false, swapped = false, newChild;
  let before = {}, sessionIds = [], readableIds = [];
  try {
    emit("staging", 25, "\u6682\u5B58\u66F4\u65B0\u4E0E\u4F9D\u8D56\uFF0C\u5F53\u524D\u8282\u70B9\u4ECD\u53EF\u4F7F\u7528");
    staged = await stageProfile({
      profile: job.profile,
      directory: job.directory,
      cli: job.cli,
      targetVersion: job.targetVersion,
      runtime: { executable: job.executable, cli: job.pnpm, version: INSTALL_PNPM_VERSION }
    });
    emit("checking", 50, "\u786E\u8BA4\u4F1A\u8BDD\u7A7A\u95F2\u5E76\u4FDD\u5B58\u72B6\u6001");
    const old = job.controlOrigin ? await control(job, "describe") : await describe(job);
    if (old.pluginVersion !== job.previousVersion) throw new Error("\u5F53\u524D\u63D2\u4EF6\u5728\u68C0\u67E5\u540E\u53D1\u751F\u53D8\u5316");
    const list = (await beforeRpc(job, "session.list")).items;
    if (!Array.isArray(list) || list.some((s) => s.running !== false)) throw new Error("\u8BF7\u7B49\u5F85\u5168\u90E8\u4F1A\u8BDD\u7ED3\u675F\u540E\u518D\u66F4\u65B0");
    sessionIds = list.map((s) => s.sessionId).sort();
    for (const sessionId of sessionIds) {
      try {
        await beforeRpc(job, "session.history", { sessionId, maxMessages: 1 });
        readableIds.push(sessionId);
      } catch {
      }
    }
    await quiesce();
    disposed = Boolean(job.controlOrigin);
    before = durableSnapshot(job);
    writePrivateJsonAtomic(path3.join(job.directory, "before-hashes.json"), before);
    emit("backup", 60, "\u5907\u4EFD\u914D\u7F6E\u4E0E\u6570\u636E");
    const backup = path3.join(job.directory, "home-before");
    fs3.mkdirSync(backup, { mode: 448 });
    for (const entry of fs3.readdirSync(job.home, { withFileTypes: true })) {
      if (["harness-remote-updates", "profiles"].includes(entry.name)) continue;
      if (entry.isSymbolicLink()) throw new Error("\u6570\u636E\u76EE\u5F55\u5305\u542B\u5916\u90E8\u94FE\u63A5\uFF0C\u8BF7\u624B\u5DE5\u5907\u4EFD\u540E\u66F4\u65B0");
      fs3.cpSync(path3.join(job.home, entry.name), path3.join(backup, entry.name), { recursive: true });
    }
    emit("restarting", 70, "\u6B63\u5728\u91CD\u542F\u5F53\u524D DSH\uFF0C\u8FDE\u63A5\u4F1A\u6682\u65F6\u65AD\u5F00");
    await stopOriginal(job);
    stopped = true;
    assertPreserved(before, durableSnapshot(job));
    migrateLegacyGrantOwner(job);
    safePlainDirectory(job.profile);
    fs3.renameSync(job.profile, previous);
    try {
      fs3.renameSync(staged, job.profile);
      swapped = true;
    } catch (error) {
      fs3.renameSync(previous, job.profile);
      throw error;
    }
    newChild = start(job);
    emit("verifying", 85, "\u68C0\u67E5\u63D2\u4EF6\u7248\u672C\u3001\u8282\u70B9\u8EAB\u4EFD\u548C\u4F1A\u8BDD");
    await healthy(job, job.targetVersion);
    await verifyFence(job);
    assertPreserved(before, durableSnapshot(job));
    const after = (await rpc(job, "session.list")).items.map((s) => s.sessionId).sort();
    if (JSON.stringify(after) !== JSON.stringify(sessionIds)) throw new Error("\u91CD\u542F\u540E\u4F1A\u8BDD\u5217\u8868\u4E0D\u4E00\u81F4");
    for (const id of readableIds) await rpc(job, "session.history", { sessionId: id, maxMessages: 1 });
    writePrivateJsonAtomic(path3.join(job.directory, "verification-complete.json"), { id: job.id });
    return { phase: "complete", progress: 100, message: "\u63D2\u4EF6\u66F4\u65B0\u5B8C\u6210\uFF0CDSH \u5DF2\u6062\u590D\uFF1B\u539F\u8282\u70B9\u65E0\u9700\u91CD\u65B0\u914D\u5BF9\u3002", terminal: true, ok: true };
  } catch (error) {
    let rollback = false;
    writePrivateJsonAtomic(path3.join(job.directory, "failure.json"), {
      message: error instanceof Error ? error.message : "unknown",
      stack: error instanceof Error ? error.stack : void 0,
      cause: error instanceof Error && error.cause instanceof Error ? error.cause.message : void 0
    });
    if (job.controlOrigin && !disposed) {
      try {
        disposed = (await control(job, "describe")).quiesced === true;
      } catch {
      }
    }
    if (stopped || disposed) {
      emit("rolling-back", 90, "\u66F4\u65B0\u672A\u901A\u8FC7\u9A8C\u8BC1\uFF0C\u6B63\u5728\u6062\u590D\u539F\u63D2\u4EF6");
      try {
        if (!stopped) {
          await stopOriginal(job);
          stopped = true;
        }
        if (newChild) await stopRestarted(newChild);
        else if (swapped && job.manager && job.manager.kind !== "process") stopManagedHost(job.manager);
        if (swapped) {
          fs3.renameSync(job.profile, path3.join(job.directory, "profile-failed"));
          fs3.renameSync(previous, job.profile);
        }
        start(job);
        await healthy(job, job.previousVersion);
        assertPreserved(before, durableSnapshot(job));
        rollback = true;
        writePrivateJsonAtomic(path3.join(job.directory, "verification-complete.json"), { id: job.id });
      } catch {
        return { phase: "attention", progress: 100, message: "\u81EA\u52A8\u6062\u590D\u672A\u5B8C\u6210\u3002\u5907\u4EFD\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u6309\u4E3B\u673A\u66F4\u65B0\u8BB0\u5F55\u6062\u590D\uFF1B\u4E0D\u8981\u5220\u9664\u8282\u70B9\u6216\u6570\u636E\u3002", terminal: true, ok: false, rollback: false };
      }
    }
    return { phase: "failed", progress: 100, message: (error instanceof Error ? error.message : "\u66F4\u65B0\u5931\u8D25") + (rollback ? "\uFF1B\u5DF2\u6062\u590D\u539F\u63D2\u4EF6\u3002" : "\uFF1B\u5F53\u524D\u63D2\u4EF6\u672A\u66FF\u6362\u3002"), terminal: true, ok: false, rollback };
  }
}
async function workerMain(filename) {
  const job = JSON.parse(fs3.readFileSync(filename, "utf8"));
  validateJob(job);
  if (!job.controlOrigin && (process.ppid !== job.parentPid || !process.connected)) throw new Error("Updater requires its initiating parent");
  let status = { phase: "starting", progress: 20, message: "\u6B63\u5728\u51C6\u5907\u66F4\u65B0", terminal: false };
  const record = (value) => {
    status = value;
    try {
      writePrivateJsonAtomic(path3.join(job.directory, "result.json"), value);
    } catch (error) {
      console.error("Update progress journal unavailable:", error.code || "write-failed");
    }
  };
  const server = http.createServer((req, res) => {
    const origin = String(req.headers.origin || "");
    const allowed = [`http://127.0.0.1:${job.webPort}`, `http://localhost:${job.webPort}`, `http://[::1]:${job.webPort}`].includes(origin);
    if (!allowed || req.headers.host !== `127.0.0.1:${server.address().port}`) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Headers", "Authorization");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method !== "GET" || req.url !== "/status" || req.headers.authorization !== `Bearer ${job.statusToken}`) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(status));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    if (job.controlOrigin) {
      writePrivateJsonAtomic(path3.join(job.directory, "worker-ready.json"), { id: job.id, origin: `http://127.0.0.1:${server.address().port}` });
      let authorized = false;
      for (let i = 0; i < 150; i++) {
        try {
          authorized = JSON.parse(fs3.readFileSync(path3.join(job.directory, "authorized.json"), "utf8")).id === job.id;
        } catch {
        }
        if (authorized) break;
        await wait(100);
      }
      if (!authorized || (await control(job, "describe")).pid !== job.parentPid) throw new Error("Updater start authorization expired");
    } else await new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer2);
        process.off("message", message);
        process.off("disconnect", disconnected);
      };
      const message = (m) => {
        if (m.type === "start" && m.id === job.id) {
          cleanup();
          resolve();
        }
      };
      const disconnected = () => {
        cleanup();
        reject(new Error("Initiating parent disconnected before authorization"));
      };
      const timer2 = setTimeout(() => {
        cleanup();
        reject(new Error("Updater start authorization expired"));
      }, 15e3);
      process.on("message", message);
      process.once("disconnect", disconnected);
      process.send?.({ type: "ready", origin: `http://127.0.0.1:${server.address().port}` });
    });
  } catch (error) {
    server.close();
    throw error;
  }
  const quiesce = () => job.controlOrigin ? control(job, "quiesce").then(() => {
  }) : new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      process.off("message", handler);
      reject(new Error("\u65E0\u6CD5\u786E\u8BA4\u4F1A\u8BDD\u72B6\u6001\u5DF2\u4FDD\u5B58"));
    }, 15e3);
    const handler = (message) => {
      if (message.type !== "quiesced") return;
      clearTimeout(timeout);
      process.off("message", handler);
      message.ok ? resolve() : reject(new Error("\u6709\u4F1A\u8BDD\u6B63\u5728\u8FD0\u884C\u6216\u65E0\u6CD5\u786E\u8BA4\u6301\u4E45\u5316\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"));
    };
    process.on("message", handler);
    process.send?.({ type: "quiesce" });
  });
  try {
    record(await executeUpdate(job, record, quiesce));
  } catch (error) {
    console.error("Update transaction ended unexpectedly:", error.code || error.name || "unknown");
    record({
      phase: "attention",
      progress: 100,
      terminal: true,
      ok: false,
      message: "\u66F4\u65B0\u88AB\u5F02\u5E38\u4E2D\u65AD\uFF0C\u65E0\u6CD5\u786E\u8BA4\u6062\u590D\u7ED3\u679C\u3002\u8BF7\u4FDD\u7559\u4E3B\u673A\u66F4\u65B0\u76EE\u5F55\u5E76\u68C0\u67E5\u539F\u63D2\u4EF6\u5907\u4EFD\uFF0C\u4E0D\u8981\u5220\u9664\u8282\u70B9\u6216\u91CD\u590D\u5B89\u88C5\u3002"
    });
  }
  const lock = path3.join(job.profile, ".harness-remote-update.lock");
  releaseOwnedUpdateLock(lock, job.id);
  if (job.controlOrigin) {
    try {
      await control(job, "close");
    } catch {
    }
  }
  if (process.connected) process.send?.({ type: "finished" });
  const timer = setTimeout(() => {
    server.close();
    if (process.connected) process.disconnect();
  }, 12e4);
  timer.unref();
}
if (process.argv[1] && path3.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void workerMain(process.argv[2]).catch(() => {
    process.exitCode = 1;
    if (process.connected) process.disconnect();
  });
}
export {
  control,
  executeUpdate,
  healthy,
  migrateLegacyGrantOwner,
  releaseOwnedUpdateLock,
  validateJob
};
