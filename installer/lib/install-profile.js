/* Generated from the shared plugin installation sources. */

// src/install-profile.ts
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
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
      fs.symlinkSync(fs.readlinkSync(source), target, type);
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
  const archiveName = `harness-remote-${job.targetVersion}-${digest}.tgz`;
  fs.copyFileSync(archive, path.join(job.profile, archiveName));
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
  NativeInstallError,
  PLUGIN_PACKAGE,
  backupProfile,
  installProfile,
  installToolPath,
  runNativePlugin,
  safeProfileName
};
