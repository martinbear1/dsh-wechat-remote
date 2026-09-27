/* Generated from the shared plugin installation sources. */

// src/install-profile.ts
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { spawn, execFile } from "node:child_process";
var PLUGIN_PACKAGE = "@harness-remote/dsh-wechat-remote";
var NATIVE_PLUGIN_PACKAGE = "dsh-wechat-remote";
var ProfileOwnershipError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ProfileOwnershipError";
  }
};
function assertCliInstallOwner(profile, activeRoot) {
  if (path.basename(profile).toLowerCase() === "desktop") {
    throw new ProfileOwnershipError("Desktop \u7531\u684C\u9762\u5E94\u7528\u7BA1\u7406\uFF0C\u8BF7\u5728\u5176\u63D2\u4EF6\u7BA1\u7406\u9875\u5B89\u88C5\u6216\u66F4\u65B0\uFF1B\u6B64\u547D\u4EE4\u4E0D\u4F1A\u66F4\u65B0 Desktop\u3002");
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(profile, "package.json"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && !activeRoot) return;
    throw new ProfileOwnershipError("\u65E0\u6CD5\u8BFB\u53D6\u5F53\u524D DSH \u914D\u7F6E\u7684\u5B89\u88C5\u5F52\u5C5E\uFF0C\u672A\u66FF\u6362\u63D2\u4EF6\u3002");
  }
  const object = (value) => value && typeof value === "object" && !Array.isArray(value);
  if (!object(manifest) || manifest.dependencies !== void 0 && !object(manifest.dependencies) || manifest.dsh !== void 0 && !object(manifest.dsh) || manifest.dsh?.profile !== void 0 && !object(manifest.dsh.profile)) {
    throw new ProfileOwnershipError("DSH \u914D\u7F6E\u7684\u5B89\u88C5\u5F52\u5C5E\u65E0\u6548\uFF0C\u672A\u66FF\u6362\u63D2\u4EF6\u3002");
  }
  const bundles = manifest.dsh?.profile?.bundles ?? [];
  if (!Array.isArray(bundles) || bundles.some((name) => typeof name !== "string")) {
    throw new ProfileOwnershipError("DSH \u914D\u7F6E\u7684\u63D2\u4EF6\u5217\u8868\u65E0\u6548\uFF0C\u672A\u66FF\u6362\u63D2\u4EF6\u3002");
  }
  const referenced = (name) => Object.hasOwn(manifest.dependencies ?? {}, name) || bundles.includes(name);
  if (referenced(NATIVE_PLUGIN_PACKAGE)) {
    throw new ProfileOwnershipError(referenced(PLUGIN_PACKAGE) ? "\u5F53\u524D DSH \u914D\u7F6E\u540C\u65F6\u767B\u8BB0\u4E86\u4E24\u79CD\u5FAE\u4FE1\u8FDE\u63A5\u63D2\u4EF6\u5B89\u88C5\u5305\uFF0C\u672A\u66FF\u6362\u63D2\u4EF6\u3002\u8BF7\u5148\u5728\u8BE5\u7AEF\u539F\u751F\u63D2\u4EF6\u7BA1\u7406\u9875\u6838\u5BF9\u5B89\u88C5\u6765\u6E90\uFF0C\u52FF\u91CD\u590D\u5B89\u88C5\u3002" : "\u5F53\u524D\u63D2\u4EF6\u7531\u8BE5\u7AEF DSH \u539F\u751F\u63D2\u4EF6\u7BA1\u7406\u9875\u7BA1\u7406\uFF0C\u8BF7\u56DE\u5230\u8BE5\u9875\u9762\u66F4\u65B0\uFF1B\u672A\u53E6\u5916\u5B89\u88C5\u7B2C\u4E8C\u4EFD\u63D2\u4EF6\u3002");
  }
  if (activeRoot) {
    let matches = false;
    try {
      matches = fs.realpathSync(activeRoot) === fs.realpathSync(path.join(profile, "node_modules", PLUGIN_PACKAGE));
    } catch {
    }
    if (!referenced(PLUGIN_PACKAGE) || !matches) {
      throw new ProfileOwnershipError("\u8FD0\u884C\u4E2D\u7684\u63D2\u4EF6\u4E0E\u5F53\u524D\u914D\u7F6E\u767B\u8BB0\u7684\u5B89\u88C5\u6765\u6E90\u4E0D\u4E00\u81F4\uFF0C\u672A\u66FF\u6362\u63D2\u4EF6\u3002");
    }
  }
}
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
  if (profile.toLowerCase() === "desktop") throw new Error("Desktop \u63D2\u4EF6\u5B89\u88C5\u7531\u684C\u9762\u5E94\u7528\u7BA1\u7406\uFF0C\u4E0D\u80FD\u4F7F\u7528 CLI \u4FEE\u6539\u3002");
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
  if (scope.toLowerCase() === "desktop") throw new Error("Desktop \u63D2\u4EF6\u5B89\u88C5\u7531\u684C\u9762\u5E94\u7528\u7BA1\u7406\uFF0C\u4E0D\u80FD\u4F7F\u7528 CLI \u4FEE\u6539\u3002");
  if (!safeProfileName(scope) || path.dirname(job.profile) !== path.join(home, "profiles") || !/^[\w.+-]{1,80}$/.test(job.targetVersion)) throw new Error("\u5B89\u88C5\u76EE\u6807\u4E0D\u660E\u786E\u3002");
  assertCliInstallOwner(job.profile);
  fs.mkdirSync(job.profile, { recursive: true, mode: 448 });
  const archive = path.join(job.directory, "release.tgz");
  const digest = createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
  const archiveBase = `harness-remote-${job.targetVersion}-${digest}`;
  const suffix = fs.existsSync(path.join(job.profile, `${archiveBase}.tgz`)) ? `-${randomBytes(8).toString("hex")}` : "";
  const archiveName = `${archiveBase}${suffix}.tgz`;
  fs.copyFileSync(archive, path.join(job.profile, archiveName), fs.constants.COPYFILE_EXCL);
  const tools = installToolPath(job.directory, job.runtime);
  const logFile = path.join(job.directory, "install.log");
  const deadline = Date.now() + 6e5;
  const run = (operation = "add") => runNativePlugin(job.cli, scope, home, tools, job.runtime, logFile, archiveName, Math.max(1, deadline - Date.now()), operation);
  try {
    await run();
  } catch (error) {
    const layoutError = /^\s*(?:\[ERR_PNPM_|ERR_PNPM_)(?:UNEXPECTED_VIRTUAL_STORE|UNEXPECTED_STORE|MODULES_BREAKING_CHANGE|VIRTUAL_STORE_DIR_MAX_LENGTH_DIFF|PUBLIC_HOIST_PATTERN_DIFF|HOIST_PATTERN_DIFF)(?:\]|\s)/m;
    if (!(error instanceof NativeInstallError) || error.mayStillBeRunning || !layoutError.test(fs.readFileSync(logFile, "utf8"))) throw error;
    fs.appendFileSync(logFile, "\nRestoring native pnpm layout with dsh plugin install.\n");
    await run("install");
    await run();
  }
  const installed = path.join(job.profile, "node_modules", PLUGIN_PACKAGE);
  if (JSON.parse(fs.readFileSync(path.join(installed, "package.json"), "utf8")).version !== job.targetVersion) throw new Error("\u5B89\u88C5\u540E\u63D2\u4EF6\u7248\u672C\u4E0D\u5339\u914D\u3002");
  const after = JSON.parse(fs.readFileSync(path.join(job.profile, "package.json"), "utf8"));
  if (!after.dsh?.profile?.bundles?.includes(PLUGIN_PACKAGE)) throw new Error("DSH \u5C1A\u672A\u5C06\u63D2\u4EF6\u6CE8\u518C\u4E3A\u539F\u751F profile \u5C42\u3002");
}
export {
  NATIVE_PLUGIN_PACKAGE,
  NativeInstallError,
  PLUGIN_PACKAGE,
  ProfileOwnershipError,
  assertCliInstallOwner,
  backupProfile,
  installProfile,
  installToolPath,
  runNativePlugin,
  safeProfileName
};
