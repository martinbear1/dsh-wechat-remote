/* Generated from the shared plugin installation sources. */

// src/companion-updates.ts
import fs from "node:fs";
import path5 from "node:path";
import { spawn, execFile as execFile2 } from "node:child_process";
import { promisify as promisify2 } from "node:util";
import { createHash as createHash2, randomBytes as randomBytes2 } from "node:crypto";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/update-policy.ts
var versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;
function validVersion(value) {
  if (typeof value !== "string" || value.length > 80) return false;
  const match = versionPattern.exec(value);
  return Boolean(match && !(match[4] || "").split(".").some((p) => /^0\d+$/.test(p)) && (!value.includes("+") || /^[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*$/.test(value.split("+")[1])));
}
function compareVersions(a, b) {
  if (!validVersion(a) || !validVersion(b)) throw new Error("Invalid version");
  const x = versionPattern.exec(a), y = versionPattern.exec(b);
  if (!x || !y) throw new Error("Invalid version");
  for (let i = 1; i <= 3; i++) if (x[i] !== y[i]) return BigInt(x[i]) > BigInt(y[i]) ? 1 : -1;
  if (!x[4] || !y[4]) return x[4] === y[4] ? 0 : !x[4] ? 1 : -1;
  const xp = x[4].split("."), yp = y[4].split(".");
  for (let i = 0; i < Math.max(xp.length, yp.length); i++) {
    if (xp[i] === yp[i]) continue;
    if (xp[i] === void 0 || yp[i] === void 0) return xp[i] === void 0 ? -1 : 1;
    const xn = /^\d+$/.test(xp[i]), yn = /^\d+$/.test(yp[i]);
    if (xn && yn) return BigInt(xp[i]) > BigInt(yp[i]) ? 1 : -1;
    if (xn !== yn) return xn ? -1 : 1;
    return xp[i] > yp[i] ? 1 : -1;
  }
  return 0;
}

// src/secure-file.ts
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
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
  publishPrivateJson(file, value, true);
}
function publishPrivateJson(file, value, replace) {
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
    if (replace) renameSync(temporary, file);
    else {
      try {
        linkSync(temporary, file);
      } catch (error) {
        if (error.code === "EEXIST") return false;
        throw error;
      }
    }
    tightenPrivateFile(file);
    return true;
  } finally {
    if (existsSync(temporary)) {
      try {
        rmSync(temporary, { force: true });
      } catch {
      }
    }
  }
}

// src/agent-metadata.ts
import path4 from "node:path";
import { fileURLToPath } from "node:url";

// src/host-platform.ts
import { execFile } from "node:child_process";
import { existsSync as existsSync2 } from "node:fs";
import { homedir, networkInterfaces, platform } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var BasePlatformAdapter = class {
  async isPotentiallyBlockingPath(_target, signal) {
    signal.throwIfAborted();
    return false;
  }
  lanIPv4() {
    return selectLanIPv4();
  }
};
var WindowsPlatformAdapter = class extends BasePlatformAdapter {
  descriptor = Object.freeze({
    kind: "windows",
    name: "Windows",
    pathStyle: "windows",
    directoryRootStyle: "drives"
  });
  rootsPromise;
  rootsByPath = /* @__PURE__ */ new Map();
  async filesystemRoots(signal) {
    if (!this.rootsPromise) {
      const workerSignal = new AbortController().signal;
      this.rootsPromise = enumerateWindowsRoots(workerSignal).then((roots) => {
        this.rootsByPath.clear();
        for (const root2 of roots) this.rootsByPath.set(root2.path.toUpperCase(), root2);
        return roots;
      }).catch((error) => {
        this.rootsPromise = void 0;
        throw error;
      });
    }
    return await raceSignal(this.rootsPromise, signal);
  }
  async isPotentiallyBlockingPath(target, signal) {
    signal.throwIfAborted();
    if (target.startsWith("\\\\")) return true;
    const match = /^([A-Za-z]):[\\/]/.exec(target);
    if (!match) return false;
    const rootPath = `${match[1].toUpperCase()}:\\`;
    let root2 = this.rootsByPath.get(rootPath);
    if (!root2) {
      try {
        await this.filesystemRoots(signal);
      } catch (error) {
        signal.throwIfAborted();
        return true;
      }
      root2 = this.rootsByPath.get(rootPath);
    }
    return root2?.kind === "network";
  }
};
var MacPlatformAdapter = class extends BasePlatformAdapter {
  descriptor = Object.freeze({
    kind: "macos",
    name: "macOS",
    pathStyle: "posix",
    directoryRootStyle: "filesystem"
  });
  async filesystemRoots(signal) {
    signal.throwIfAborted();
    const roots = [
      { name: "\u4E3B\u76EE\u5F55", path: homedir(), kind: "home" },
      { name: "\u6839\u76EE\u5F55", path: "/", kind: "filesystem" }
    ];
    if (existsSync2("/Volumes")) roots.push({ name: "\u5377", path: "/Volumes", kind: "volume" });
    return roots;
  }
  async isPotentiallyBlockingPath(target, signal) {
    signal.throwIfAborted();
    const normalized = path.resolve(target);
    return normalized.startsWith("/Volumes/");
  }
};
var LinuxPlatformAdapter = class extends BasePlatformAdapter {
  descriptor = Object.freeze({
    kind: "linux",
    name: "Linux",
    pathStyle: "posix",
    directoryRootStyle: "filesystem"
  });
  async filesystemRoots(signal) {
    signal.throwIfAborted();
    const roots = [
      { name: "\u4E3B\u76EE\u5F55", path: homedir(), kind: "home" },
      { name: "\u6839\u76EE\u5F55", path: "/", kind: "filesystem" }
    ];
    for (const mountRoot of ["/mnt", "/media"]) {
      if (existsSync2(mountRoot)) roots.push({ name: path.basename(mountRoot), path: mountRoot, kind: "volume" });
    }
    return roots;
  }
  async isPotentiallyBlockingPath(target, signal) {
    signal.throwIfAborted();
    const normalized = path.resolve(target);
    return normalized.startsWith("/mnt/") || normalized.startsWith("/media/") || /\/run\/user\/\d+\/gvfs(?:\/|$)/.test(normalized);
  }
};
var UnknownPlatformAdapter = class extends BasePlatformAdapter {
  descriptor = Object.freeze({
    kind: "unknown",
    name: "Unknown",
    pathStyle: path.sep === "\\" ? "windows" : "posix",
    directoryRootStyle: path.sep === "\\" ? "drives" : "filesystem"
  });
  async filesystemRoots(signal) {
    signal.throwIfAborted();
    return [{ name: "\u4E3B\u76EE\u5F55", path: homedir(), kind: "home" }];
  }
};
function buildAdapter() {
  switch (platform()) {
    case "win32":
      return new WindowsPlatformAdapter();
    case "darwin":
      return new MacPlatformAdapter();
    case "linux":
      return new LinuxPlatformAdapter();
    default:
      return new UnknownPlatformAdapter();
  }
}
var hostPlatform = buildAdapter();
function selectLanIPv4(source = networkInterfaces()) {
  const candidates = [];
  for (const [name, addresses] of Object.entries(source)) {
    for (const item of addresses || []) {
      if (item.family !== "IPv4" || item.internal || !item.address) continue;
      candidates.push({ name, address: item.address });
    }
  }
  candidates.sort((left, right) => scoreAddress(right) - scoreAddress(left));
  return candidates[0]?.address || "127.0.0.1";
}
function scoreAddress(candidate) {
  const address = candidate.address;
  const name = candidate.name.toLowerCase();
  let score = 0;
  if (address.startsWith("192.168.")) score += 100;
  else if (address.startsWith("10.")) score += 90;
  else if (isPrivate172(address)) score += 80;
  else score += 10;
  if (/^(en0|en1|wi-?fi|wlan\d*|ethernet|以太网)/i.test(name)) score += 30;
  if (/(docker|veth|vmnet|virtualbox|hyper-v|wsl|loopback|utun|bridge|tunnel|vpn)/i.test(name)) score -= 80;
  if (address.startsWith("169.254.") || isBenchmarkAddress(address) || isCarrierGradeNat(address)) score -= 200;
  return score;
}
function isPrivate172(address) {
  const match = /^172\.(\d+)\./.exec(address);
  if (!match) return false;
  const second = Number(match[1]);
  return second >= 16 && second <= 31;
}
function isBenchmarkAddress(address) {
  const match = /^198\.(\d+)\./.exec(address);
  if (!match) return false;
  const second = Number(match[1]);
  return second === 18 || second === 19;
}
function isCarrierGradeNat(address) {
  const match = /^100\.(\d+)\./.exec(address);
  if (!match) return false;
  const second = Number(match[1]);
  return second >= 64 && second <= 127;
}
async function enumerateWindowsRoots(signal) {
  const script = [
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Name -match '^[A-Za-z]$' -and $_.Root -match '^[A-Za-z]:\\\\$' } | ForEach-Object {",
    "  [pscustomobject]@{ name = $_.Name.ToUpperInvariant(); path = $_.Root; displayRoot = $(if ($_.DisplayRoot) { [string]$_.DisplayRoot } else { $null }) }",
    "} | Sort-Object name | ConvertTo-Json -Compress"
  ].join("; ");
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8", windowsHide: true, timeout: 8e3, signal }
  );
  signal.throwIfAborted();
  const text = String(stdout).replace(/^\uFEFF/, "").trim();
  if (!text) return [];
  const decoded = JSON.parse(text);
  const rows = Array.isArray(decoded) ? decoded : [decoded];
  const unique = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (typeof row.name !== "string" || typeof row.path !== "string") continue;
    const name = row.name.toUpperCase();
    if (!/^[A-Z]$/.test(name) || !/^[A-Za-z]:[\\/]$/.test(row.path)) continue;
    const rootPath = `${name}:\\`;
    const displayRoot = typeof row.displayRoot === "string" && row.displayRoot.trim() ? row.displayRoot : void 0;
    unique.set(rootPath, {
      name: `${name}:`,
      path: rootPath,
      kind: displayRoot ? "network" : "local",
      ...displayRoot ? { displayRoot } : {}
    });
  }
  return [...unique.values()].sort((left, right) => left.path.localeCompare(right.path));
}
function raceSignal(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", aborted);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", aborted);
        reject(error);
      }
    );
  });
}

// src/dsh-runtime.ts
import { homedir as homedir2 } from "node:os";
import path3 from "node:path";

// src/dsh-host-context.ts
import path2 from "node:path";
var profiles = /* @__PURE__ */ new WeakMap();
function dshProfileFacts(ctx) {
  const value = ctx?.get("profileContext");
  if (value === void 0 || value === null) {
    if (process.versions.electron) throw new Error("\u684C\u9762\u5BBF\u4E3B\u672A\u63D0\u4F9B\u8FD0\u884C\u5B9E\u4F8B\u4FE1\u606F\uFF0C\u672A\u4F7F\u7528 Web \u914D\u7F6E");
    return;
  }
  if (typeof value !== "object") throw new Error("DSH \u8FD0\u884C\u5B9E\u4F8B\u4FE1\u606F\u65E0\u6548\uFF0C\u672A\u4F7F\u7528\u5176\u4ED6\u5B9E\u4F8B\u7684\u914D\u7F6E");
  const cached = profiles.get(value);
  if (cached) return cached;
  const row = value;
  if (typeof row.name !== "string" || !row.name || row.name.length > 80 || /[\\/\u0000-\u001f]/.test(row.name) || [".", "..", "node_modules"].includes(row.name) || !["home", "dir", "installAnchor"].every((key) => typeof row[key] === "string" && path2.isAbsolute(row[key]) && !row[key].includes("\0"))) {
    throw new Error("DSH \u8FD0\u884C\u5B9E\u4F8B\u4FE1\u606F\u4E0D\u5B8C\u6574\uFF0C\u672A\u4F7F\u7528\u5176\u4ED6\u5B9E\u4F8B\u7684\u914D\u7F6E");
  }
  const facts = Object.freeze({
    name: row.name,
    home: path2.normalize(row.home),
    dir: path2.normalize(row.dir),
    installAnchor: path2.normalize(row.installAnchor)
  });
  profiles.set(value, facts);
  return facts;
}

// src/dsh-runtime.ts
function adapterDshHome(environment = process.env, userHome = homedir2()) {
  const configured = environment.DSH_HOME;
  const selected = configured && configured.trim() ? configured : path3.join(userHome, ".dsh");
  const expanded = selected === "~" ? userHome : /^~[\\/]/.test(selected) ? path3.join(userHome, selected.slice(2)) : selected;
  return path3.resolve(expanded);
}

// src/agent-metadata.ts
var AGENT_CAPABILITIES = Object.freeze([
  Object.freeze({ id: "dsh.rpc", version: 1 }),
  Object.freeze({ id: "dsh.realtime", version: 1 }),
  Object.freeze({ id: "wechat.directory", version: 1 }),
  Object.freeze({ id: "wechat.history-window", version: 1 }),
  Object.freeze({ id: "wechat.attachment-object", version: 1 }),
  Object.freeze({ id: "harness.public-relay-e2ee", version: 1 }),
  Object.freeze({ id: "harness.lan-bootstrap", version: 1 }),
  Object.freeze({ id: "harness.host-platform", version: 1 }),
  Object.freeze({ id: "harness.oss-e2ee-objects", version: 1 }),
  Object.freeze({ id: "harness.secure-lan", version: 1 })
]);
function agentDshHome(ctx) {
  return dshProfileFacts(ctx)?.home ?? adapterDshHome();
}
function agentProfileScope(ctx) {
  return dshProfileFacts(ctx)?.name ?? resolveAgentProfileScope(fileURLToPath(import.meta.url), process.argv, adapterDshHome());
}
function resolveAgentProfileScope(modulePath, argv, dshHome) {
  const valid = (value) => Boolean(value) && value.length <= 80 && !/[\\/\u0000-\u001f]/.test(value) && value !== "." && value !== ".." && value !== "node_modules";
  for (let index = 2; index < argv.length && argv[index] !== "--"; index++) {
    const arg = argv[index];
    const candidate = arg === "--profile" ? argv[index + 1] : arg.startsWith("--profile=") ? arg.slice("--profile=".length) : void 0;
    if (valid(candidate)) return candidate;
  }
  const relative = path4.relative(path4.join(dshHome, "profiles"), modulePath);
  const parts = relative.split(/[\\/]/);
  if (valid(parts[0]) && parts[1] === "node_modules") return parts[0];
  if (argv[2] === "web") return "web";
  return "default";
}

// src/update-download.ts
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
function verifyBytes(archive, expected) {
  if (!expected || archive.length !== expected.bytes || createHash("sha256").update(archive).digest("hex") !== expected.sha256) throw new Error("\u66F4\u65B0\u5305\u6821\u9A8C\u5931\u8D25\uFF0C\u672A\u4FEE\u6539\u5F53\u524D\u63D2\u4EF6");
}
function visitArchive(archive, visit) {
  const tar = gunzipSync(archive, { maxOutputLength: 64 * 1024 * 1024 });
  if (tar.length % 512 !== 0) throw new Error("\u66F4\u65B0\u5305\u8BB0\u5F55\u4E0D\u5B8C\u6574");
  const seen = /* @__PURE__ */ new Set(), files = /* @__PURE__ */ new Set();
  let entries = 0, ended = false;
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) {
      if (tar.subarray(offset).some((b) => b !== 0)) throw new Error("\u66F4\u65B0\u5305\u7ED3\u675F\u6807\u8BB0\u65E0\u6548");
      ended = true;
      break;
    }
    if (++entries > 5e3) throw new Error("\u66F4\u65B0\u5305\u6587\u4EF6\u6570\u91CF\u5F02\u5E38");
    const field = (start, size2) => header.subarray(start, start + size2).toString("utf8").replace(/\0.*$/s, "");
    const name = (field(345, 155) ? field(345, 155) + "/" : "") + field(0, 100);
    const type = field(156, 1);
    const sizeText = field(124, 12).trim();
    if (!/^[0-7]+$/.test(sizeText)) throw new Error("\u66F4\u65B0\u5305\u5927\u5C0F\u5B57\u6BB5\u65E0\u6548");
    const size = parseInt(sizeText, 8);
    const sumText = field(148, 8).trim();
    const sum = [...header].reduce((n, b, i) => n + (i >= 148 && i < 156 ? 32 : b), 0);
    if (!/^[0-7]+$/.test(sumText) || parseInt(sumText, 8) !== sum) throw new Error("\u66F4\u65B0\u5305\u5934\u6821\u9A8C\u5931\u8D25");
    if (!name.startsWith("package/") || /[\\:\x00-\x1f]/.test(name) || name.split("/").some((part) => part === ".." || part === ".") || name.split("/").some((part) => /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) || !["0", "", "5"].includes(type) || seen.has(name.toLowerCase()) || !Number.isSafeInteger(size) || size < 0 || type === "5" && size !== 0 || offset + 512 + Math.ceil(size / 512) * 512 > tar.length) throw new Error("\u66F4\u65B0\u5305\u5305\u542B\u4E0D\u5B89\u5168\u7684\u8DEF\u5F84\u6216\u6587\u4EF6\u7C7B\u578B");
    seen.add(name.toLowerCase());
    if (type !== "5") {
      files.add(name);
      visit(name, tar.subarray(offset + 512, offset + 512 + size));
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!ended) throw new Error("\u66F4\u65B0\u5305\u7F3A\u5C11\u7ED3\u675F\u6807\u8BB0");
  return files;
}
function readManifest(data) {
  if (data.length > 65536) throw new Error("\u66F4\u65B0\u5305\u6E05\u5355\u8FC7\u5927");
  return JSON.parse(data.toString("utf8"));
}
function auditArchive(archive, release) {
  verifyBytes(archive, release.asset);
  let manifest;
  const files = visitArchive(archive, (name, data) => {
    if (name === "package/package.json") manifest = readManifest(data);
  });
  if (!manifest || manifest.name !== "@harness-remote/dsh-wechat-remote" || manifest.version !== release.version || !files.has("package/lib/index.js") || !files.has("package/lib/client.js")) throw new Error("\u66F4\u65B0\u5305\u540D\u79F0\u3001\u7248\u672C\u6216\u5165\u53E3\u4E0D\u5339\u914D");
  const scripts = manifest.scripts;
  if (["preinstall", "install", "postinstall", "prepare"].some((name) => scripts?.[name])) throw new Error("\u66F4\u65B0\u5305\u5305\u542B\u4E0D\u5141\u8BB8\u7684\u5B89\u88C5\u811A\u672C");
}
function auditNativeArchive(archive, version) {
  let manifest, metadata, plugin;
  const files = visitArchive(archive, (name, data) => {
    if (name === "package/package.json") manifest = readManifest(data);
    if (name === "package/assets/release.json") metadata = readManifest(data);
    if (name === "package/assets/plugin.tgz") plugin = Buffer.from(data);
  });
  if (manifest?.name !== "dsh-wechat-remote" || manifest.version !== version || manifest.dsh?.bundle?.patch !== "./cordis.patch.yml" || !files.has("package/native/lib/index.js") || !files.has("package/native/lib/client.js") || !files.has("package/cordis.patch.yml") || !plugin || metadata?.version !== version || ["preinstall", "install", "postinstall", "prepare", "prepack", "postpack"].some((key) => manifest.scripts?.[key])) {
    throw new Error("\u539F\u751F\u8054\u52A8\u5B89\u88C5\u5305\u7ED3\u6784\u6216\u7248\u672C\u4E0D\u5339\u914D");
  }
  const release = metadata.catalog?.releases?.find((row) => row.version === version);
  if (!release) throw new Error("\u539F\u751F\u8054\u52A8\u5B89\u88C5\u5305\u7F3A\u5C11\u5185\u7F6E\u7248\u672C\u4FE1\u606F");
  auditArchive(plugin, release);
}

// src/companion-updates.ts
var core = "@harness-remote/dsh-wechat-remote";
var native = "dsh-wechat-remote";
var versionPattern2 = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/;
var pending = () => ({ state: "pending", message: "\u53E6\u4E00\u7AEF\u5C06\u5728\u5176\u539F\u751F\u66F4\u65B0\u5165\u53E3\u53EF\u7528\u65F6\u5904\u7406\uFF1B\u5F53\u524D\u8282\u70B9\u4E0D\u53D7\u5F71\u54CD\u3002" });
function scopeOf(value) {
  return value === "desktop" ? "desktop" : value === "web" || value === "default" ? "web" : void 0;
}
function read(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function root(home) {
  return path5.join(home, "harness-remote", "installation-offers");
}
function recordResult(home, scope, offer, value) {
  const directory = root(home), file = path5.join(directory, `result-${scope}.json`);
  try {
    if (read(path5.join(directory, `${scope}.json`)).id !== offer.id) return false;
  } catch {
    return false;
  }
  try {
    const last = read(file);
    if (last.id === offer.id && last.state === "complete" && value.state !== "complete") return false;
  } catch {
  }
  writePrivateJsonAtomic(file, { id: offer.id, version: offer.version, ...value });
  return true;
}
function companionTarget(home, scope) {
  const profile = path5.join(home, "profiles", scope);
  let manifest;
  try {
    manifest = read(path5.join(profile, "package.json"));
  } catch {
    return;
  }
  const dependencies = manifest.dependencies || {}, enabled = manifest.dsh?.profile?.bundles;
  if (!Array.isArray(enabled)) return;
  const owners = [core, native].filter((name) => Object.hasOwn(dependencies, name));
  if (owners.length !== 1 || !enabled.includes(owners[0])) return;
  const owner = owners[0];
  if (scope === "desktop" && owner !== native) return;
  try {
    const installed = read(path5.join(profile, "node_modules", owner, "package.json"));
    if (installed.name !== owner || !versionPattern2.test(installed.version)) return;
    return { owner: owner === core ? "cli" : "native", version: installed.version };
  } catch {
    return;
  }
}
function checkedSource(source, version) {
  if (!path5.isAbsolute(source) || !versionPattern2.test(version)) throw new Error("\u8054\u52A8\u5B89\u88C5\u6765\u6E90\u65E0\u6548");
  const actual = fs.realpathSync(source), manifest = read(path5.join(actual, "package.json"));
  if (manifest.name !== native || manifest.version !== version || manifest.dsh?.bundle?.patch !== "./cordis.patch.yml" || ["preinstall", "install", "postinstall", "prepare", "prepack", "postpack"].some((key) => manifest.scripts?.[key])) throw new Error("\u8054\u52A8\u5B89\u88C5\u5305\u4E0E\u76EE\u6807\u7248\u672C\u4E0D\u4E00\u81F4");
  const metadata = read(path5.join(actual, "assets/release.json"));
  const release = metadata.catalog?.releases?.find((row) => row.version === version);
  const bytes = fs.readFileSync(path5.join(actual, "assets/plugin.tgz"));
  if (!release || metadata.version !== version || release.asset?.bytes !== bytes.length || createHash2("sha256").update(bytes).digest("hex") !== release.asset.sha256) throw new Error("\u8054\u52A8\u5B89\u88C5\u5305\u6821\u9A8C\u5931\u8D25");
  return actual;
}
function offerCompanionUpdate(home, from, source, version) {
  const to = from === "web" ? "desktop" : "web", peer = companionTarget(home, to);
  if (!peer || compareVersions(version, peer.version) <= 0) return;
  if (source) source = checkedSource(source, version);
  else if (from !== "web" || !versionPattern2.test(version)) throw new Error("\u53EA\u6709 Web \u53EF\u901A\u77E5\u539F\u751F Desktop \u83B7\u53D6\u540C\u7248\u672C npm \u5305");
  const directory = root(home), file = path5.join(directory, `${to}.json`);
  try {
    const existing = read(file);
    if (existing.from === from && existing.version === version && existing.previous === peer.version) return existing;
    if (versionPattern2.test(existing.version) && compareVersions(existing.version, version) > 0) return;
  } catch {
  }
  const offer = { schema: 1, id: randomBytes2(16).toString("hex"), from, to, source, version, previous: peer.version };
  writePrivateJsonAtomic(file, offer);
  return offer;
}
function validateCompanionOffer(home, scope, offer) {
  if (offer.schema !== 1 || !/^[a-f0-9]{32}$/.test(offer.id) || offer.to !== scope || offer.from !== (scope === "web" ? "desktop" : "web") || !versionPattern2.test(offer.version) || !versionPattern2.test(offer.previous) || compareVersions(offer.version, offer.previous) <= 0) throw new Error("\u8054\u52A8\u66F4\u65B0\u8BF7\u6C42\u65E0\u6548");
  const current = read(path5.join(root(home), `${scope}.json`));
  if (["schema", "id", "from", "to", "version", "previous", "source"].some((key) => current[key] !== offer[key])) {
    throw new Error("\u8054\u52A8\u66F4\u65B0\u8BF7\u6C42\u5DF2\u53D8\u5316\uFF0C\u672A\u6267\u884C\u65E7\u8BF7\u6C42");
  }
  const target = companionTarget(home, scope);
  if (!target || ![offer.previous, offer.version].includes(target.version)) throw new Error("\u53E6\u4E00\u7AEF\u7684\u5B89\u88C5\u3001\u7248\u672C\u6216\u542F\u7528\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u672A\u66FF\u6362\u63D2\u4EF6");
  if (offer.source) {
    if (target.version !== offer.version) checkedSource(offer.source, offer.version);
  } else if (scope !== "desktop" || offer.from !== "web") throw new Error("\u8054\u52A8\u5B89\u88C5\u6765\u6E90\u65E0\u6548");
  return target;
}
async function stageCompanionArchive(home, source, version) {
  const actual = checkedSource(source, version);
  const pnpm = path5.join(actual, "node_modules/pnpm/bin/pnpm.cjs");
  if (!fs.existsSync(pnpm)) throw new Error("\u5B89\u88C5\u5305\u7F3A\u5C11\u5185\u7F6E\u6253\u5305\u5DE5\u5177\uFF0C\u672A\u4F7F\u7528\u5168\u5C40\u5DE5\u5177\u66FF\u4EE3");
  const artifacts = path5.join(root(home), "artifacts");
  fs.mkdirSync(artifacts, { recursive: true, mode: 448 });
  const temporary = path5.join(artifacts, `packing-${randomBytes2(16).toString("hex")}.tgz`);
  try {
    await promisify2(execFile2)(process.execPath, [pnpm, "--config.ignore-scripts=true", "--config.node-linker=hoisted", "pack", "--out", temporary], {
      cwd: actual,
      windowsHide: true,
      timeout: 6e4,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
    });
    checkedSource(actual, version);
    if (fs.statSync(temporary).size > 32 * 1024 * 1024) throw new Error("\u8054\u52A8\u5B89\u88C5\u5305\u8D85\u8FC7\u5B89\u5168\u5927\u5C0F\u9650\u5236");
    const bytes = fs.readFileSync(temporary);
    auditNativeArchive(bytes, version);
    const digest = createHash2("sha256").update(bytes).digest("hex");
    const archive = path5.join(artifacts, `${digest}.tgz`);
    try {
      fs.writeFileSync(archive, bytes, { flag: "wx", mode: 384 });
    } catch (error) {
      if (error.code !== "EEXIST" || createHash2("sha256").update(fs.readFileSync(archive)).digest("hex") !== digest) throw error;
    }
    return archive;
  } finally {
    try {
      fs.unlinkSync(temporary);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}
async function applyNativeCompanion(home, scope, runningVersion, offer, services) {
  services.signal?.throwIfAborted();
  const target = validateCompanionOffer(home, scope, offer);
  if (target.owner !== "native") throw new Error("\u6B64\u8282\u70B9\u5E94\u7531 Web \u5B89\u88C5\u5668\u66F4\u65B0");
  if (runningVersion === offer.version) {
    if (target.version !== offer.version) throw new Error("\u78C1\u76D8\u5B89\u88C5\u5DF2\u53D8\u5316\uFF0C\u672A\u8986\u76D6\u6216\u91CD\u65B0\u5347\u7EA7");
    return { state: "complete", message: "\u4E24\u7AEF\u63D2\u4EF6\u5DF2\u5BF9\u9F50\u3002" };
  }
  if (target.version === offer.version) return { state: "restart-required", message: "\u53E6\u4E00\u7AEF\u63D2\u4EF6\u5DF2\u5B89\u88C5\uFF0C\u91CD\u542F\u8BE5\u5E94\u7528\u540E\u751F\u6548\u3002" };
  if (runningVersion !== offer.previous) throw new Error("\u8FD0\u884C\u7248\u672C\u4E0E\u5B89\u88C5\u7248\u672C\u4E0D\u540C\uFF0C\u672A\u6267\u884C\u8054\u52A8\u66F4\u65B0");
  const list = await services.list();
  services.signal?.throwIfAborted();
  if (!Array.isArray(list?.items) || list.items.some((row) => typeof row.running !== "boolean")) throw new Error("\u65E0\u6CD5\u786E\u8BA4\u53E6\u4E00\u7AEF\u7684\u4F1A\u8BDD\u72B6\u6001");
  if (list.items.some((row) => row.running)) return { state: "busy", message: "\u53E6\u4E00\u7AEF\u6B63\u5728\u6267\u884C\u4EFB\u52A1\uFF0C\u4EFB\u52A1\u7ED3\u675F\u540E\u518D\u5904\u7406\u66F4\u65B0\u3002" };
  const archive = offer.source ? await (services.stage ?? stageCompanionArchive)(home, offer.source, offer.version) : `${native}@${offer.version}`;
  services.signal?.throwIfAborted();
  validateCompanionOffer(home, scope, offer);
  const current = await services.list();
  services.signal?.throwIfAborted();
  if (!Array.isArray(current?.items) || current.items.some((row) => typeof row.running !== "boolean")) throw new Error("\u65E0\u6CD5\u786E\u8BA4\u53E6\u4E00\u7AEF\u7684\u4F1A\u8BDD\u72B6\u6001");
  if (current.items.some((row) => row.running)) return { state: "busy", message: "\u53E6\u4E00\u7AEF\u6B63\u5728\u6267\u884C\u4EFB\u52A1\uFF0C\u4EFB\u52A1\u7ED3\u675F\u540E\u518D\u5904\u7406\u66F4\u65B0\u3002" };
  const ready = validateCompanionOffer(home, scope, offer);
  if (ready.owner !== target.owner || ready.version !== offer.previous) throw new Error("\u53E6\u4E00\u7AEF\u7684\u5B89\u88C5\u5DF2\u53D8\u5316\uFF0C\u672A\u91CD\u590D\u5B89\u88C5");
  const result = await services.install(archive);
  if (!["applied", "restart-required"].includes(result?.application) || result.error || result.bundle !== native) {
    throw new Error("\u539F\u751F\u63D2\u4EF6\u7BA1\u7406\u5668\u672A\u5B8C\u6210\u66F4\u65B0\uFF0C\u8BF7\u5728\u8BE5\u5E94\u7528\u7684\u63D2\u4EF6\u7BA1\u7406\u9875\u67E5\u770B\u539F\u56E0\u6216\u5B8C\u6210\u5BA1\u6279");
  }
  if (companionTarget(home, scope)?.version !== offer.version) throw new Error("\u539F\u751F\u5B89\u88C5\u540E\u7684\u7248\u672C\u6821\u9A8C\u672A\u901A\u8FC7");
  return { state: "restart-required", message: "\u53E6\u4E00\u7AEF\u63D2\u4EF6\u5DF2\u5B89\u88C5\uFF0C\u91CD\u542F\u8BE5\u5E94\u7528\u540E\u751F\u6548\u3002" };
}
async function webInstallerRuntime(environment = process.env, electron = Boolean(process.versions.electron)) {
  const env = { ...environment };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.DSH_DESKTOP_NODE_EXECUTABLE;
  if (!electron) return { executable: process.execPath, env };
  const search = Object.entries(env).find(([key]) => key.toLowerCase() === "path")?.[1] || "";
  const candidates = [...new Set(search.split(path5.delimiter).filter((value) => path5.isAbsolute(value)).map((directory) => path5.join(directory, process.platform === "win32" ? "node.exe" : "node")))].slice(0, 32);
  const signal = AbortSignal.timeout(1e4);
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const { stdout } = await promisify2(execFile2)(
        candidate,
        ["-p", "JSON.stringify({executable:process.execPath,node:process.versions.node,electron:!!process.versions.electron})"],
        { env, windowsHide: true, timeout: 2e3, signal, maxBuffer: 4096 }
      );
      const value = JSON.parse(stdout.trim()), [major, minor] = String(value.node).split(".").map(Number);
      if (!value.electron && (major > 22 || major === 22 && minor >= 13) && fs.realpathSync(value.executable) === fs.realpathSync(candidate)) return { executable: fs.realpathSync(candidate), env };
    } catch {
    }
    if (signal.aborted) break;
  }
  throw new Error("\u672A\u627E\u5230 Web \u4F7F\u7528\u7684\u72EC\u7ACB Node.js\uFF0C\u672A\u4F7F\u7528 Desktop \u8FD0\u884C\u65F6\u66FF\u4EE3\uFF0C\u8BF7\u5728\u7EC8\u7AEF\u6267\u884C\u539F\u5B89\u88C5\u547D\u4EE4");
}
async function runWebInstaller(home, offer, progress = () => {
}, signal) {
  signal?.throwIfAborted();
  const target = validateCompanionOffer(home, "web", offer);
  if (target.owner !== "cli") return Promise.resolve(pending());
  const worker = path5.join(offer.source, "bin/companion-worker.mjs");
  if (!fs.existsSync(worker)) throw new Error("\u6B64\u5B89\u88C5\u5305\u7F3A\u5C11\u8054\u52A8\u5B89\u88C5\u5165\u53E3");
  const runtime = await webInstallerRuntime();
  signal?.throwIfAborted();
  validateCompanionOffer(home, "web", offer);
  return new Promise((resolve, reject) => {
    const child = spawn(runtime.executable, [worker, home, offer.version, offer.previous, offer.id], {
      windowsHide: true,
      env: runtime.env,
      stdio: ["ignore", "ignore", "pipe", "ipc"]
    });
    child.on("message", (value) => {
      if (value?.type === "companion-busy") progress({ state: "busy", message: "Web \u6B63\u5728\u6267\u884C\u4EFB\u52A1\uFF0C\u6682\u4E0D\u66F4\u65B0\uFF1B\u6B63\u5728\u7B49\u5F85\u5176\u7A7A\u95F2\u3002" });
    });
    let tail = "";
    child.stderr?.on("data", (bytes) => {
      tail = (tail + bytes.toString()).slice(-2048);
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve({ state: "restart-required", message: "Web \u63D2\u4EF6\u5DF2\u5B89\u88C5\uFF0C\u7B49\u5F85\u8BE5\u8282\u70B9\u542F\u52A8\u6216\u91CD\u65B0\u8FDE\u63A5\u786E\u8BA4\u3002" }) : code === 75 ? resolve({ state: "busy", message: "Web \u4ECD\u5728\u6267\u884C\u4EFB\u52A1\uFF0C\u672C\u6B21\u672A\u66F4\u65B0\uFF1B\u4EFB\u52A1\u7ED3\u675F\u540E\u53EF\u4F7F\u7528\u539F\u5B89\u88C5\u547D\u4EE4\u5347\u7EA7\u3002" }) : reject(new Error(tail.trim() || "Web \u8054\u52A8\u66F4\u65B0\u672A\u5B8C\u6210\uFF1B\u539F\u6709\u8282\u70B9\u4FDD\u6301\u72EC\u7ACB\u3002")));
  });
}
function mountCompanionUpdates(ctx, version) {
  try {
    return mount(ctx, version);
  } catch {
    return { status: () => ({ state: "unavailable", message: "\u8054\u52A8\u66F4\u65B0\u6682\u4E0D\u53EF\u7528\uFF0C\u4ECD\u53EF\u5206\u522B\u4F7F\u7528\u539F\u751F\u66F4\u65B0\u5165\u53E3\u3002" }), dispose() {
    } };
  }
}
function mount(ctx, version) {
  const home = agentDshHome(ctx), scope = scopeOf(agentProfileScope(ctx));
  let status = { state: "idle", message: "" }, stopped = false, busy = false, recheck = false;
  const lifetime = new AbortController();
  if (!scope) return { status: () => status, dispose() {
  } };
  const directory = root(home), inbox = path5.join(directory, `${scope}.json`);
  fs.mkdirSync(directory, { recursive: true, mode: 448 });
  const receipt = (offer, value) => {
    if (stopped) return;
    try {
      if (recordResult(home, scope, offer, value)) status = value;
    } catch {
      status = { state: "unavailable", message: "\u8054\u52A8\u66F4\u65B0\u7ED3\u679C\u65E0\u6CD5\u4FDD\u5B58\uFF0C\u8BF7\u5728\u8BE5\u8282\u70B9\u7684\u539F\u751F\u63D2\u4EF6\u7BA1\u7406\u9875\u6838\u5BF9\u3002" };
    }
  };
  const check = async () => {
    if (stopped) return;
    if (busy) {
      recheck = true;
      return;
    }
    if (!existsInbox()) return;
    busy = true;
    let offer;
    try {
      offer = read(inbox);
      const target = validateCompanionOffer(home, scope, offer);
      if (version === offer.version) {
        if (target.version !== version) throw new Error("\u78C1\u76D8\u5B89\u88C5\u5DF2\u53D8\u5316");
        receipt(offer, { state: "complete", message: "\u4E24\u7AEF\u63D2\u4EF6\u5DF2\u5BF9\u9F50\u3002" });
        return;
      }
      try {
        const last = read(path5.join(directory, `result-${scope}.json`));
        if (last.id === offer.id && ["unavailable", "complete"].includes(last.state)) {
          status = last;
          return;
        }
        if (last.id === offer.id && last.state === "restart-required" && version !== offer.version) {
          status = last;
          return;
        }
      } catch {
      }
      if (target.owner === "native") {
        const manager = ctx.get("pluginManager"), controller = ctx.get("sessionController");
        if (!manager?.installBundle || !controller?.list) {
          receipt(offer, pending());
          return;
        }
        receipt(offer, await applyNativeCompanion(home, scope, version, offer, {
          signal: lifetime.signal,
          list: () => controller.list({}, AbortSignal.any([lifetime.signal, AbortSignal.timeout(15e3)])),
          install: (spec) => manager.installBundle(spec)
        }));
      } else receipt(offer, await runWebInstaller(home, offer, (value) => receipt(offer, value), lifetime.signal));
    } catch (error) {
      if (stopped) return;
      status = { state: "unavailable", message: "\u8054\u52A8\u66F4\u65B0\u672A\u5B8C\u6210\uFF1B\u8BF7\u5728\u5BF9\u5E94\u5E94\u7528\u7684\u63D2\u4EF6\u7BA1\u7406\u9875\u6838\u5BF9\uFF0C\u5F53\u524D\u8282\u70B9\u4E0D\u53D7\u5F71\u54CD\u3002" };
      if (offer && /^[a-f0-9]{32}$/.test(offer.id)) receipt(offer, status);
    } finally {
      busy = false;
      if (recheck && !stopped) {
        recheck = false;
        queueMicrotask(() => {
          void check();
        });
      }
    }
  };
  function existsInbox() {
    return fs.existsSync(inbox);
  }
  const watcher = fs.watch(directory, (_event, filename) => {
    if (String(filename) === `${scope}.json`) void check();
  });
  watcher.on("error", () => {
    status = { state: "unavailable", message: "\u8054\u52A8\u66F4\u65B0\u901A\u77E5\u4E0D\u53EF\u7528\uFF0C\u4ECD\u53EF\u5206\u522B\u4F7F\u7528\u539F\u751F\u66F4\u65B0\u5165\u53E3\u3002" };
  });
  const cleanups = [];
  try {
    const off = ctx.on?.("agent/status", (event) => {
      if (event?.status === "idle") void check();
    });
    if (typeof off === "function") cleanups.push(off);
    const dependency = ctx.inject?.(["pluginManager", "sessionController"], () => {
      void check();
    });
    if (dependency?.dispose) cleanups.push(() => {
      void Promise.resolve(dependency.dispose()).catch(() => {
      });
    });
  } catch (error) {
    stopped = true;
    lifetime.abort();
    watcher.close();
    cleanups.forEach((fn) => fn());
    throw error;
  }
  const kickoff = setImmediate(() => {
    if (stopped) return;
    const source = path5.resolve(path5.dirname(fileURLToPath2(import.meta.url)), "../..");
    try {
      let packageName;
      try {
        packageName = read(path5.join(source, "package.json")).name;
      } catch {
      }
      const ownPackage = read(path5.join(path5.dirname(fileURLToPath2(import.meta.url)), "../package.json")).name;
      if (packageName === native || scope === "web" && ownPackage === core) {
        const seen = path5.join(directory, `offered-${scope}.json`);
        let previous;
        try {
          previous = read(seen);
        } catch {
        }
        if (previous?.version !== version) {
          const offer = offerCompanionUpdate(home, scope, packageName === native ? source : "", version);
          writePrivateJsonAtomic(seen, { version });
          if (offer?.to === "web" && companionTarget(home, "web")?.owner === "cli" && compareVersions(offer.previous, "1.7.12-rc.4") < 0) {
            const report = (value) => {
              try {
                recordResult(home, "web", offer, value);
              } catch {
              }
            };
            void runWebInstaller(home, offer, report, lifetime.signal).then(report).catch(() => {
              report({ state: "unavailable", message: "Web \u8054\u52A8\u5B89\u88C5\u672A\u5B8C\u6210\uFF0C\u8BF7\u5728 Web \u4E2D\u4F7F\u7528\u539F\u6709\u5B89\u88C5\u547D\u4EE4\uFF1BDesktop \u4E0D\u53D7\u5F71\u54CD\u3002" });
            });
          }
        }
      }
    } catch {
    }
    void check();
  });
  return { status: () => {
    const to = scope === "web" ? "desktop" : "web";
    try {
      const offer = read(path5.join(directory, `${to}.json`));
      if (offer.from === scope && offer.version === version) {
        const peer = validateCompanionOffer(home, to, offer);
        const last = read(path5.join(directory, `result-${to}.json`));
        if (last.id === offer.id && ["pending", "busy", "restart-required", "complete", "unavailable"].includes(last.state)) {
          if (["complete", "restart-required"].includes(last.state) && peer.version !== version) {
            return { state: "unavailable", message: "\u53E6\u4E00\u7AEF\u7684\u5B89\u88C5\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5728\u8BE5\u5E94\u7528\u5185\u6838\u5BF9\uFF1B\u5F53\u524D\u8282\u70B9\u4E0D\u53D7\u5F71\u54CD\u3002" };
          }
          return { state: last.state, message: `${to === "web" ? "Web" : "Desktop"}\uFF1A${String(last.message).slice(0, 240)}` };
        }
      }
    } catch {
    }
    try {
      const offer = read(path5.join(directory, `${to}.json`));
      if (offer.from === scope && offer.version === version) {
        try {
          validateCompanionOffer(home, to, offer);
        } catch {
          return { state: "unavailable", message: "\u53E6\u4E00\u7AEF\u7684\u5B89\u88C5\u6216\u542F\u7528\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u672A\u7EE7\u7EED\u66F4\u65B0\uFF1B\u5F53\u524D\u8282\u70B9\u4E0D\u53D7\u5F71\u54CD\u3002" };
        }
        return pending();
      }
    } catch {
    }
    return status;
  }, dispose() {
    stopped = true;
    lifetime.abort();
    clearImmediate(kickoff);
    watcher.close();
    cleanups.forEach((fn) => fn());
  } };
}
export {
  applyNativeCompanion,
  companionTarget,
  mountCompanionUpdates,
  offerCompanionUpdate,
  stageCompanionArchive,
  validateCompanionOffer,
  webInstallerRuntime
};
