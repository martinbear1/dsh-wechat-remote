/* Generated from the shared plugin installation sources. */

// src/update-worker.ts
import fs4 from "node:fs";
import path4 from "node:path";
import http from "node:http";
import { spawn as spawn4 } from "node:child_process";
import { createHash as createHash2, createPublicKey } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

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
import { createHash, randomBytes as randomBytes2 } from "node:crypto";
import { spawn, execFile } from "node:child_process";
var PLUGIN_PACKAGE = "@harness-remote/dsh-wechat-remote";
function safeProfileName(value) {
  return /^[A-Za-z0-9_-]{1,80}$/.test(value);
}
function backupProfile(profile, backup) {
  if (fs.existsSync(backup)) throw new Error("\u672C\u6B21\u5B89\u88C5\u5907\u4EFD\u5DF2\u5B58\u5728\uFF0C\u672A\u8986\u76D6\u3002");
  fs.cpSync(profile, backup, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
    mode: fs.constants.COPYFILE_FICLONE,
    filter(source, target) {
      if (!fs.lstatSync(source).isSymbolicLink()) return true;
      const type = process.platform === "win32" ? fs.statSync(source, { throwIfNoEntry: false })?.isDirectory() ? "junction" : "file" : void 0;
      const link = fs.readlinkSync(source);
      fs.symlinkSync(type === "junction" ? path.resolve(path.dirname(source), link) : link, target, type);
      return false;
    }
  });
}
function installToolPath(directory, runtime) {
  const bin = path.join(directory, "tool-bin");
  fs.mkdirSync(bin, { mode: 448 });
  if (process.platform === "win32") {
    if (/["\r\n]/.test(runtime.executable + runtime.cli)) throw new Error("\u5B89\u88C5\u5DE5\u5177\u8DEF\u5F84\u5305\u542B\u65E0\u6548\u5B57\u7B26\u3002");
    fs.writeFileSync(path.join(bin, "pnpm.cmd"), '@echo off\r\nsetlocal DisableDelayedExpansion\r\n"%HARNESS_INSTALL_NODE%" "%HARNESS_INSTALL_PNPM%" %*\r\n', { mode: 448 });
  } else {
    fs.writeFileSync(path.join(bin, "pnpm"), '#!/bin/sh\nexec "$HARNESS_INSTALL_NODE" "$HARNESS_INSTALL_PNPM" "$@"\n', { mode: 448 });
  }
  return bin;
}
var NativeInstallError = class extends Error {
  constructor(message, mayStillBeRunning = false) {
    super(message);
    this.mayStillBeRunning = mayStillBeRunning;
    this.name = "NativeInstallError";
  }
};
function runNativePlugin(cli, profile, home, toolPath, runtime, logFile, archiveName, timeoutMs = 6e5, operation = "add") {
  if (!safeProfileName(profile) || !/^harness-remote-[\w.+-]+\.tgz$/.test(archiveName)) throw new Error("\u65E0\u6548\u7684\u5B89\u88C5\u76EE\u6807\u3002");
  return new Promise((resolve, reject) => {
    const log = fs.openSync(logFile, "a", 384);
    const env = { ...process.env };
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path");
    const inheritedPath = pathKey ? env[pathKey] : "";
    if (process.platform === "win32") {
      for (const key of Object.keys(env)) if (key.toLowerCase() === "path") delete env[key];
    }
    Object.assign(env, {
      DSH_HOME: home,
      PATH: toolPath + path.delimiter + (inheritedPath || ""),
      HARNESS_INSTALL_NODE: runtime.executable,
      HARNESS_INSTALL_PNPM: runtime.cli,
      CI: "true",
      COREPACK_ENABLE_AUTO_PIN: "0",
      npm_config_manage_package_manager_versions: "false"
    });
    const child = spawn(runtime.executable, [
      cli,
      "plugin",
      "--profile",
      profile,
      ...operation === "install" ? ["install"] : ["add", `file:${archiveName}`],
      "--ignore-scripts",
      "--config.frozen-lockfile=false",
      "--prefer-offline",
      "--config.manage-package-manager-versions=false",
      "--reporter=append-only"
    ], {
      cwd: home,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", log, log],
      env
    });
    fs.closeSync(log);
    let finished = false, terminating = false, closed = false, terminationTimer;
    const fail = (message, uncertain = false) => finish(new NativeInstallError(`${message} \u5B89\u88C5\u65E5\u5FD7\uFF1A${logFile}`, uncertain));
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(terminationTimer);
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(() => {
      if (closed) return;
      terminating = true;
      terminationTimer = setTimeout(() => fail("\u5B89\u88C5\u8D85\u65F6\uFF0C\u5C1A\u4E0D\u80FD\u786E\u8BA4\u5B89\u88C5\u8FDB\u7A0B\u5DF2\u9000\u51FA\uFF1B\u672A\u81EA\u52A8\u56DE\u9000\uFF0C\u8BF7\u52FF\u91CD\u590D\u5B89\u88C5\u3002", true), 15e3);
      if (process.platform === "win32") {
        if (!child.pid) return fail("\u5B89\u88C5\u7A0B\u5E8F\u672A\u542F\u52A8\u3002");
        execFile(
          path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe"),
          ["/PID", String(child.pid), "/T", "/F"],
          { windowsHide: true, timeout: 1e4 },
          (error) => {
            if (error) fail("\u5B89\u88C5\u8D85\u65F6\uFF0C\u65E0\u6CD5\u786E\u8BA4\u5B89\u88C5\u8FDB\u7A0B\u6811\u5DF2\u9000\u51FA\uFF1B\u672A\u81EA\u52A8\u56DE\u9000\uFF0C\u8BF7\u52FF\u91CD\u590D\u5B89\u88C5\u3002", true);
            else if (closed) fail("\u4E0B\u8F7D\u6216\u5B89\u88C5\u8D85\u65F6\uFF0C\u5B89\u88C5\u8FDB\u7A0B\u5DF2\u505C\u6B62\u3002");
            else child.once("close", () => fail("\u4E0B\u8F7D\u6216\u5B89\u88C5\u8D85\u65F6\uFF0C\u5B89\u88C5\u8FDB\u7A0B\u5DF2\u505C\u6B62\u3002"));
          }
        );
      } else {
        try {
          if (child.pid) process.kill(-child.pid, "SIGKILL");
        } catch (error) {
          if (error.code !== "ESRCH") return fail("\u65E0\u6CD5\u505C\u6B62\u8D85\u65F6\u7684\u5B89\u88C5\u8FDB\u7A0B\uFF1B\u672A\u81EA\u52A8\u56DE\u9000\u3002", true);
        }
        if (closed) fail("\u4E0B\u8F7D\u6216\u5B89\u88C5\u8D85\u65F6\uFF0C\u5B89\u88C5\u8FDB\u7A0B\u5DF2\u505C\u6B62\u3002");
        else child.once("close", () => fail("\u4E0B\u8F7D\u6216\u5B89\u88C5\u8D85\u65F6\uFF0C\u5B89\u88C5\u8FDB\u7A0B\u5DF2\u505C\u6B62\u3002"));
      }
    }, timeoutMs);
    child.once("error", (error) => fail(`\u65E0\u6CD5\u542F\u52A8 DSH \u539F\u751F\u5B89\u88C5\u7A0B\u5E8F\uFF08${error.code || error.name}\uFF09\u3002`));
    child.once("close", (code, signal) => {
      closed = true;
      if (terminating) return;
      if (code === 0) finish();
      else fail(`DSH \u539F\u751F\u5B89\u88C5\u672A\u5B8C\u6210\uFF08${signal ? `\u4FE1\u53F7 ${signal}` : `\u9000\u51FA\u7801 ${code}`}\uFF09\u3002`);
    });
  });
}
async function installProfile(job) {
  const scope = path.basename(job.profile), home = path.dirname(path.dirname(job.profile));
  if (!safeProfileName(scope) || path.dirname(job.profile) !== path.join(home, "profiles") || !/^[\w.+-]{1,80}$/.test(job.targetVersion)) throw new Error("\u5B89\u88C5\u76EE\u6807\u4E0D\u660E\u786E\u3002");
  fs.mkdirSync(job.profile, { recursive: true, mode: 448 });
  const archive = path.join(job.directory, "release.tgz");
  const digest = createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
  const archiveBase = `harness-remote-${job.targetVersion}-${digest}`;
  const suffix = fs.existsSync(path.join(job.profile, `${archiveBase}.tgz`)) ? `-${randomBytes2(8).toString("hex")}` : "";
  const archiveName = `${archiveBase}${suffix}.tgz`;
  fs.copyFileSync(archive, path.join(job.profile, archiveName), fs.constants.COPYFILE_EXCL);
  const tools = installToolPath(job.directory, job.runtime);
  const logFile = path.join(job.directory, "install.log");
  const deadline = Date.now() + 6e5;
  const run2 = (operation = "add") => runNativePlugin(job.cli, scope, home, tools, job.runtime, logFile, archiveName, Math.max(1, deadline - Date.now()), operation);
  try {
    await run2();
  } catch (error) {
    const layoutError = /^\s*(?:\[ERR_PNPM_|ERR_PNPM_)(?:UNEXPECTED_VIRTUAL_STORE|UNEXPECTED_STORE|MODULES_BREAKING_CHANGE|VIRTUAL_STORE_DIR_MAX_LENGTH_DIFF|PUBLIC_HOIST_PATTERN_DIFF|HOIST_PATTERN_DIFF)(?:\]|\s)/m;
    if (!(error instanceof NativeInstallError) || error.mayStillBeRunning || !layoutError.test(fs.readFileSync(logFile, "utf8"))) throw error;
    fs.appendFileSync(logFile, "\nRestoring native pnpm layout with dsh plugin install.\n");
    await run2("install");
    await run2();
  }
  const installed = path.join(job.profile, "node_modules", PLUGIN_PACKAGE);
  if (JSON.parse(fs.readFileSync(path.join(installed, "package.json"), "utf8")).version !== job.targetVersion) throw new Error("\u5B89\u88C5\u540E\u63D2\u4EF6\u7248\u672C\u4E0D\u5339\u914D\u3002");
  const after = JSON.parse(fs.readFileSync(path.join(job.profile, "package.json"), "utf8"));
  if (!after.dsh?.profile?.bundles?.includes(PLUGIN_PACKAGE)) throw new Error("DSH \u5C1A\u672A\u5C06\u63D2\u4EF6\u6CE8\u518C\u4E3A\u539F\u751F profile \u5C42\u3002");
}

// src/install-runtime.ts
import fs2 from "node:fs";
import path2 from "node:path";
import { spawn as spawn2 } from "node:child_process";
var INSTALL_PNPM_VERSION = "11.22.0";
async function pinInstallRuntime(runtime, directory) {
  let root = path2.dirname(runtime.cli);
  while (!fs2.existsSync(path2.join(root, "package.json"))) {
    const parent = path2.dirname(root);
    if (parent === root) throw new Error("\u65E0\u6CD5\u5B9A\u4F4D\u5B89\u88C5\u5DE5\u5177\u5305\u3002");
    root = parent;
  }
  const manifest = JSON.parse(fs2.readFileSync(path2.join(root, "package.json"), "utf8"));
  if (manifest.name !== "pnpm" || manifest.version !== runtime.version) throw new Error("\u5B89\u88C5\u5DE5\u5177\u7248\u672C\u4E0D\u4E00\u81F4\u3002");
  const target = path2.join(directory, "install-runtime");
  if (fs2.existsSync(target)) throw new Error("\u672C\u6B21\u5B89\u88C5\u5DE5\u5177\u76EE\u5F55\u5DF2\u5B58\u5728\u3002");
  fs2.cpSync(root, target, { recursive: true, dereference: false, verbatimSymlinks: true, mode: fs2.constants.COPYFILE_FICLONE });
  const pinned = { ...runtime, cli: path2.join(target, path2.relative(root, runtime.cli)) };
  await verifyInstallRuntime(pinned);
  return pinned;
}
function verifyInstallRuntime(runtime) {
  return new Promise((resolve, reject) => {
    const child = spawn2(runtime.executable, [runtime.cli, "--version"], {
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

// src/install-lifecycle.ts
import fs3 from "node:fs";
import path3 from "node:path";
import { execFileSync as execFileSync2, spawn as spawn3 } from "node:child_process";
var serviceName = (s) => /^[A-Za-z0-9_.@-]{1,180}$/.test(s);
function run(command, args) {
  return execFileSync2(command, args, { encoding: "utf8", windowsHide: true, timeout: 15e3, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function validateManager(value) {
  if (value.kind === "process") return;
  if (value.kind === "systemd" && process.platform === "linux" && serviceName(value.unit) && value.unit.endsWith(".service")) return;
  if (value.kind === "launchd" && process.platform === "darwin" && serviceName(value.label) && /^gui\/\d+$/.test(value.domain) && value.domain === `gui/${process.getuid?.()}` && path3.isAbsolute(value.plist) && fs3.statSync(value.plist).isFile()) return;
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
function finishUpdateWorker(manager, directory) {
  const id = path3.basename(directory);
  if (manager?.kind !== "launchd" || !/^[a-f0-9]{32}$/.test(id)) return;
  try {
    run("/bin/launchctl", ["remove", `dsh.wechat.update.${id}`]);
  } catch {
  }
}

// src/update-worker.ts
function releaseOwnedUpdateLock(lock, id) {
  try {
    if (fs4.readFileSync(lock, "utf8") === id) fs4.unlinkSync(lock);
  } catch {
  }
}
var wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var hashFile = (f) => createHash2("sha256").update(fs4.readFileSync(f)).digest("hex");
function within(parent, child) {
  const relative = path4.relative(parent, child);
  return Boolean(relative) && !relative.startsWith("..") && !path4.isAbsolute(relative);
}
function safePlainDirectory(p) {
  if (!fs4.statSync(p).isDirectory() || fs4.lstatSync(p).isSymbolicLink() || fs4.realpathSync(p) !== path4.resolve(p)) throw new Error("\u5B89\u88C5\u76EE\u5F55\u4E0D\u662F\u53EF\u5B89\u5168\u66FF\u6362\u7684\u72EC\u7ACB\u76EE\u5F55");
}
function validateJob(job) {
  if (!/^[a-f0-9]{32}$/.test(job.id) || path4.basename(job.directory) !== job.id || !within(path4.join(job.home, "harness-remote-updates"), job.directory) || !within(path4.join(job.home, "profiles"), job.profile) || path4.dirname(job.profile) !== path4.join(job.home, "profiles") || !within(job.home, job.stateFile) || !Number.isInteger(job.parentPid) || job.parentPid < 1 || ![job.webPort, job.gatePort, job.localPort].every((p) => Number.isInteger(p) && p > 0 && p <= 65535) || job.argv[0] !== job.cli || !/^[\w.+-]{1,80}$/.test(job.targetVersion)) throw new Error("\u66F4\u65B0\u4EFB\u52A1\u8303\u56F4\u6821\u9A8C\u5931\u8D25");
  safePlainDirectory(job.profile);
  safePlainDirectory(job.directory);
  if (job.identityFile && !within(job.home, job.identityFile)) throw new Error("\u8282\u70B9\u8EAB\u4EFD\u6587\u4EF6\u4E0D\u5C5E\u4E8E\u5F53\u524D DSH");
  if (job.controlOrigin) {
    const u = new URL(job.controlOrigin);
    if (u.protocol !== "http:" || u.hostname !== "127.0.0.1" || !u.port || u.username || u.password || u.pathname !== "/" || u.search || u.hash) throw new Error("\u5B89\u88C5\u63A7\u5236\u5730\u5740\u65E0\u6548");
    validateManager(job.manager);
  }
  for (const f of [job.executable, job.cli, job.pnpm, ...job.previousVersion === "0.0.0" ? [] : [job.stateFile]]) if (!fs4.statSync(f).isFile()) throw new Error("\u5B89\u88C5\u8FD0\u884C\u65F6\u5DF2\u53D8\u5316");
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
  const state = JSON.parse(fs4.readFileSync(job.stateFile, "utf8"));
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
    if (!fs4.existsSync(dir)) return;
    for (const e of fs4.readdirSync(dir, { withFileTypes: true })) {
      const file = path4.join(dir, e.name);
      if (e.isSymbolicLink()) result[path4.relative(job.home, file)] = createHash2("sha256").update(fs4.readlinkSync(file)).digest("hex");
      else if (e.isDirectory()) walk(file);
      else if (e.isFile()) result[path4.relative(job.home, file)] = hashFile(file);
    }
  };
  walk(path4.join(job.home, "sessions"));
  walk(path4.join(job.home, "attachments"));
  walk(path4.join(job.home, "harness-remote"));
  for (const e of fs4.readdirSync(job.home, { withFileTypes: true })) {
    if (e.isFile() && /(?:identity|settings|credentials|public|gate-wechat)/i.test(e.name) && !e.name.endsWith(".log")) {
      const f = path4.join(job.home, e.name);
      if (f === job.stateFile) continue;
      result[e.name] = hashFile(f);
    }
  }
  if (fs4.existsSync(job.stateFile)) {
    const state = JSON.parse(fs4.readFileSync(job.stateFile, "utf8"));
    result["$binding"] = createHash2("sha256").update(JSON.stringify([state.token, state.publicIdentityNodeId])).digest("hex");
  }
  return result;
}
function assertPreserved(before, after) {
  for (const [key, hash] of Object.entries(before)) if (after[key] !== hash) throw new Error("\u5347\u7EA7\u540E\u6570\u636E\u6821\u9A8C\u4E0D\u4E00\u81F4\uFF1B\u505C\u6B62\u81EA\u52A8\u64CD\u4F5C\u5E76\u4FDD\u7559\u5907\u4EFD");
}
function migrateLegacyGrantOwner(job) {
  if (job.previousVersion !== "1.5.5" || !job.identityFile || !fs4.existsSync(job.identityFile)) return;
  const state = JSON.parse(fs4.readFileSync(job.stateFile, "utf8"));
  if (state.publicIdentityNodeId) return;
  const identity = JSON.parse(fs4.readFileSync(job.identityFile, "utf8"));
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
async function healthy(job, version, timeoutMs = 18e4) {
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
  const log = fs4.openSync(path4.join(job.directory, "restart.log"), "a", 384);
  const child = spawn4(job.executable, [...job.execArgv, ...job.argv], {
    cwd: job.cwd,
    env: { ...process.env, HARNESS_REMOTE_UPDATE_JOB: job.directory },
    stdio: ["ignore", log, log],
    detached: true,
    windowsHide: true
  });
  fs4.closeSync(log);
  child.on("error", () => {
  });
  child.unref();
  if (!child.pid) throw new Error("\u65E0\u6CD5\u542F\u52A8\u539F DSH \u547D\u4EE4");
  writePrivateJsonAtomic(path4.join(job.directory, "restarted-process.json"), { pid: child.pid, cli: job.cli, home: job.home, webPort: job.webPort });
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
async function stopRestarted(child, timeoutMs = 3e4, forceTimeoutMs = 5e3) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await wait(Math.min(100, Math.max(1, deadline - Date.now())));
  }
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGKILL");
  const forcedDeadline = Date.now() + forceTimeoutMs;
  while (Date.now() < forcedDeadline) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await wait(Math.min(100, Math.max(1, forcedDeadline - Date.now())));
  }
  if (child.exitCode !== null || child.signalCode !== null) return;
  throw new Error("\u66F4\u65B0\u540E\u7684 DSH \u672A\u6309\u65F6\u505C\u6B62");
}
function captureCandidateLock(home, child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const filename = path4.join(home, ".credentials.yaml.lock");
  try {
    const info = fs4.lstatSync(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 32) return;
    const value = fs4.readFileSync(filename, "utf8");
    let owned = value === `${child.pid}
`;
    if (!owned && value === "" && process.platform === "linux") {
      const directory = `/proc/${child.pid}/fd`;
      owned = fs4.readdirSync(directory).some((fd) => {
        try {
          const file = path4.join(directory, fd);
          if (fs4.readlinkSync(file) !== filename) return false;
          const opened = fs4.statSync(file);
          return opened.dev === info.dev && opened.ino === info.ino;
        } catch {
          return false;
        }
      });
    }
    if (owned) return { filename, dev: info.dev, ino: info.ino, pid: child.pid };
  } catch {
  }
}
function retireCandidateLock(lock, child, directory) {
  if (!lock || child.pid !== lock.pid || child.exitCode === null && child.signalCode === null) return;
  try {
    const info = fs4.lstatSync(lock.filename);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.dev !== lock.dev || info.ino !== lock.ino || info.size > 32) return;
    const value = fs4.readFileSync(lock.filename, "utf8");
    if (value !== "" && value !== `${lock.pid}
`) return;
    const saved = path4.join(directory, "candidate-credentials-lock.before-rollback");
    if (!fs4.existsSync(saved)) fs4.renameSync(lock.filename, saved);
  } catch {
  }
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
  const previous = path4.join(job.directory, "profile-before");
  const emit = (phase, n, message) => progress({ phase, progress: n, message, terminal: false });
  let stopped = false, disposed = false, modified = false, newChild;
  let before = {}, sessionIds = [], readableIds = [];
  let preexistingFailure = false;
  try {
    emit("preparing", 25, "\u51C6\u5907\u5B89\u88C5\u5DE5\u5177\uFF0C\u5F53\u524D\u8282\u70B9\u4ECD\u53EF\u4F7F\u7528");
    const runtime = await pinInstallRuntime({ executable: job.executable, cli: job.pnpm, version: INSTALL_PNPM_VERSION }, job.directory);
    job.pnpm = runtime.cli;
    writePrivateJsonAtomic(path4.join(job.directory, "job.json"), job);
    emit("checking", 50, "\u786E\u8BA4\u4F1A\u8BDD\u7A7A\u95F2\u5E76\u4FDD\u5B58\u72B6\u6001");
    const old = job.controlOrigin ? await control(job, "describe") : await describe(job);
    if (old.pluginVersion !== job.previousVersion) throw new Error("\u5F53\u524D\u63D2\u4EF6\u5728\u68C0\u67E5\u540E\u53D1\u751F\u53D8\u5316");
    if (job.controlOrigin && job.previousVersion !== "0.0.0") {
      try {
        preexistingFailure = (await control(job, "health")).ready !== true;
      } catch {
        preexistingFailure = true;
      }
    }
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
    writePrivateJsonAtomic(path4.join(job.directory, "before-hashes.json"), before);
    emit("installing", 60, "\u6B63\u5728\u5B89\u88C5\u63D2\u4EF6\uFF0C\u5F53\u524D DSH \u8FDE\u63A5\u4F1A\u6682\u65F6\u65AD\u5F00");
    await stopOriginal(job);
    stopped = true;
    assertPreserved(before, durableSnapshot(job));
    backupProfile(job.profile, previous);
    migrateLegacyGrantOwner(job);
    safePlainDirectory(job.profile);
    modified = true;
    await installProfile({ profile: job.profile, directory: job.directory, cli: job.cli, targetVersion: job.targetVersion, runtime });
    emit("restarting", 75, "\u5B89\u88C5\u5B8C\u6210\uFF0C\u6B63\u5728\u6062\u590D\u5F53\u524D DSH");
    newChild = start(job);
    emit("verifying", 85, "\u68C0\u67E5\u63D2\u4EF6\u7248\u672C\u3001\u8282\u70B9\u8EAB\u4EFD\u548C\u4F1A\u8BDD");
    await healthy(job, job.targetVersion);
    await verifyFence(job);
    assertPreserved(before, durableSnapshot(job));
    const after = (await rpc(job, "session.list")).items.map((s) => s.sessionId).sort();
    if (JSON.stringify(after) !== JSON.stringify(sessionIds)) throw new Error("\u91CD\u542F\u540E\u4F1A\u8BDD\u5217\u8868\u4E0D\u4E00\u81F4");
    for (const id of readableIds) await rpc(job, "session.history", { sessionId: id, maxMessages: 1 });
    writePrivateJsonAtomic(path4.join(job.directory, "verification-complete.json"), { id: job.id });
    return { phase: "complete", progress: 100, message: "\u63D2\u4EF6\u66F4\u65B0\u5B8C\u6210\uFF0CDSH \u5DF2\u6062\u590D\uFF1B\u539F\u8282\u70B9\u65E0\u9700\u91CD\u65B0\u914D\u5BF9\u3002", terminal: true, ok: true };
  } catch (error) {
    let rollback = false;
    writePrivateJsonAtomic(path4.join(job.directory, "failure.json"), {
      message: error instanceof Error ? error.message : "unknown",
      stack: error instanceof Error ? error.stack : void 0,
      cause: error instanceof Error && error.cause instanceof Error ? error.cause.message : void 0
    });
    if (error instanceof NativeInstallError && error.mayStillBeRunning) return {
      phase: "attention",
      progress: 100,
      message: error.message,
      terminal: true,
      ok: false,
      rollback: false
    };
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
        if (newChild) {
          const ownedLock = captureCandidateLock(job.home, newChild);
          await stopRestarted(newChild);
          retireCandidateLock(ownedLock, newChild, job.directory);
        } else if (modified && job.manager && job.manager.kind !== "process") stopManagedHost(job.manager);
        if (modified) {
          fs4.renameSync(job.profile, path4.join(job.directory, "profile-failed"));
          fs4.renameSync(previous, job.profile);
        }
        if (job.previousVersion === "0.0.0" || preexistingFailure) {
          const recovery = await import(pathToFileURL(path4.join(job.directory, "native-recovery.js")).href);
          await recovery.verifyNativeRestore(job, () => start(job), sessionIds, readableIds);
        } else {
          start(job);
          await healthy(job, job.previousVersion);
        }
        assertPreserved(before, durableSnapshot(job));
        rollback = true;
        writePrivateJsonAtomic(path4.join(job.directory, "verification-complete.json"), { id: job.id });
      } catch (rollbackError) {
        try {
          writePrivateJsonAtomic(path4.join(job.directory, "rollback-failure.json"), {
            message: rollbackError instanceof Error ? rollbackError.message : "unknown",
            stack: rollbackError instanceof Error ? rollbackError.stack : void 0
          });
        } catch {
        }
        return { phase: "attention", progress: 100, message: "\u81EA\u52A8\u6062\u590D\u672A\u5B8C\u6210\u3002\u5907\u4EFD\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u6309\u4E3B\u673A\u66F4\u65B0\u8BB0\u5F55\u6062\u590D\uFF1B\u4E0D\u8981\u5220\u9664\u8282\u70B9\u6216\u6570\u636E\u3002", terminal: true, ok: false, rollback: false };
      }
    }
    return { phase: "failed", progress: 100, message: (error instanceof Error ? error.message : "\u66F4\u65B0\u5931\u8D25") + (rollback ? preexistingFailure ? "\uFF1B\u5DF2\u6062\u590D\u5B89\u88C5\u524D\u72B6\u6001\uFF0C\u539F\u6709\u63D2\u4EF6\u6545\u969C\u5C1A\u672A\u4FEE\u590D\uFF0C\u6570\u636E\u5DF2\u4FDD\u7559\u3002" : "\uFF1B\u5DF2\u6062\u590D\u539F\u63D2\u4EF6\u3002" : "\uFF1B\u5F53\u524D\u63D2\u4EF6\u672A\u66FF\u6362\u3002"), terminal: true, ok: false, rollback };
  }
}
async function workerMain(filename) {
  const job = JSON.parse(fs4.readFileSync(filename, "utf8"));
  validateJob(job);
  if (!job.controlOrigin && (process.ppid !== job.parentPid || !process.connected)) throw new Error("Updater requires its initiating parent");
  let status = { phase: "starting", progress: 20, message: "\u6B63\u5728\u51C6\u5907\u66F4\u65B0", terminal: false };
  const record = (value) => {
    status = value;
    try {
      writePrivateJsonAtomic(path4.join(job.directory, "result.json"), value);
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
      writePrivateJsonAtomic(path4.join(job.directory, "worker-ready.json"), { id: job.id, origin: `http://127.0.0.1:${server.address().port}` });
      let authorized = false;
      for (let i = 0; i < 150; i++) {
        try {
          authorized = JSON.parse(fs4.readFileSync(path4.join(job.directory, "authorized.json"), "utf8")).id === job.id;
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
  const lock = path4.join(job.profile, ".harness-remote-update.lock");
  if (status.phase !== "attention") releaseOwnedUpdateLock(lock, job.id);
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
    finishUpdateWorker(job.manager, job.directory);
  }, 12e4);
  timer.unref();
}
if (process.argv[1] && path4.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void workerMain(process.argv[2]).catch(() => {
    process.exitCode = 1;
    if (process.connected) process.disconnect();
  });
}
export {
  captureCandidateLock,
  control,
  executeUpdate,
  healthy,
  migrateLegacyGrantOwner,
  releaseOwnedUpdateLock,
  retireCandidateLock,
  stopRestarted,
  validateJob
};
