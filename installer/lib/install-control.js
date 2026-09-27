/* Generated from the shared plugin installation sources. */

// src/install-control.ts
import fs3 from "node:fs";
import path8 from "node:path";
import http from "node:http";

// src/dsh-runtime.ts
import { homedir } from "node:os";
import path2 from "node:path";

// src/dsh-host-context.ts
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
var profiles = /* @__PURE__ */ new WeakMap();
var versions = /* @__PURE__ */ new WeakMap();
var versionPattern = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;
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
  if (typeof row.name !== "string" || !row.name || row.name.length > 80 || /[\\/\u0000-\u001f]/.test(row.name) || [".", "..", "node_modules"].includes(row.name) || !["home", "dir", "installAnchor"].every((key) => typeof row[key] === "string" && path.isAbsolute(row[key]) && !row[key].includes("\0"))) {
    throw new Error("DSH \u8FD0\u884C\u5B9E\u4F8B\u4FE1\u606F\u4E0D\u5B8C\u6574\uFF0C\u672A\u4F7F\u7528\u5176\u4ED6\u5B9E\u4F8B\u7684\u914D\u7F6E");
  }
  const facts = Object.freeze({
    name: row.name,
    home: path.normalize(row.home),
    dir: path.normalize(row.dir),
    installAnchor: path.normalize(row.installAnchor)
  });
  profiles.set(value, facts);
  return facts;
}
function desktopOwnsLifecycle(ctx) {
  return Boolean(process.versions.electron) || dshProfileFacts(ctx)?.name === "desktop";
}
function hostRuntimeVersion(ctx, entry = process.argv[1]) {
  const profile = dshProfileFacts(ctx);
  if (profile) {
    const cached = versions.get(profile);
    if (cached) return cached;
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(profile.installAnchor, "utf8"));
    } catch {
      throw new Error("\u65E0\u6CD5\u8BFB\u53D6\u5F53\u524D DSH \u7684\u8FD0\u884C\u7248\u672C\uFF0C\u672A\u4F7F\u7528\u5176\u4ED6\u5B89\u88C5\u7248\u672C\u4EE3\u66FF");
    }
    if (manifest.name !== "@deepseek-ai/dsh" || typeof manifest.version !== "string" || !versionPattern.test(manifest.version)) throw new Error("\u5F53\u524D DSH \u7684\u8FD0\u884C\u7248\u672C\u4FE1\u606F\u65E0\u6548");
    versions.set(profile, manifest.version);
    return manifest.version;
  }
  if (!entry) return;
  let directory;
  try {
    directory = path.dirname(realpathSync(entry));
  } catch {
    return;
  }
  for (let depth = 0; depth < 8; depth++) {
    try {
      const manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
      if (manifest.name === "@deepseek-ai/dsh") {
        if (typeof manifest.version !== "string" || !versionPattern.test(manifest.version)) {
          throw new Error("invalid host version");
        }
        return manifest.version;
      }
    } catch {
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
}

// src/dsh-runtime.ts
function adapterDshHome(environment = process.env, userHome = homedir()) {
  const configured = environment.DSH_HOME;
  const selected = configured && configured.trim() ? configured : path2.join(userHome, ".dsh");
  const expanded = selected === "~" ? userHome : /^~[\\/]/.test(selected) ? path2.join(userHome, selected.slice(2)) : selected;
  return path2.resolve(expanded);
}
function validPort(value) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d{1,5}$/.test(value) ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : null;
}
function resolveDshWebRuntime(ctx, environment = process.env) {
  const webServer = ctx.get("webServer");
  const servicePort = validPort(webServer?.port);
  if (servicePort !== null) return { port: servicePort, source: "web-server" };
  if (desktopOwnsLifecycle(ctx)) throw new Error("\u684C\u9762\u5BBF\u4E3B\u8FDE\u63A5\u5C1A\u672A\u5C31\u7EEA\uFF0C\u672A\u4F7F\u7528 Web \u7684\u9ED8\u8BA4\u7AEF\u53E3");
  const environmentPort = validPort(environment.DSH_PORT);
  if (environmentPort !== null) return { port: environmentPort, source: "environment" };
  return { port: 3080, source: "legacy-default" };
}

// src/agent-metadata.ts
import { createHash as createHash2, randomBytes as randomBytes3 } from "node:crypto";
import { existsSync as existsSync4, readFileSync as readFileSync4, realpathSync as realpathSync2 } from "node:fs";
import { homedir as homedir3, hostname } from "node:os";
import path5 from "node:path";
import { fileURLToPath } from "node:url";

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
  readFileSync as readFileSync2,
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
function createPrivateJsonAtomic(file, value) {
  return publishPrivateJson(file, value, false);
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
function readPrivateJson(file) {
  const value = JSON.parse(readFileSync2(file, "utf8"));
  tightenPrivateFile(file);
  return value;
}

// src/host-platform.ts
import { execFile } from "node:child_process";
import { existsSync as existsSync2 } from "node:fs";
import { homedir as homedir2, networkInterfaces, platform } from "node:os";
import path3 from "node:path";
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
        for (const root of roots) this.rootsByPath.set(root.path.toUpperCase(), root);
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
    let root = this.rootsByPath.get(rootPath);
    if (!root) {
      try {
        await this.filesystemRoots(signal);
      } catch (error) {
        signal.throwIfAborted();
        return true;
      }
      root = this.rootsByPath.get(rootPath);
    }
    return root?.kind === "network";
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
      { name: "\u4E3B\u76EE\u5F55", path: homedir2(), kind: "home" },
      { name: "\u6839\u76EE\u5F55", path: "/", kind: "filesystem" }
    ];
    if (existsSync2("/Volumes")) roots.push({ name: "\u5377", path: "/Volumes", kind: "volume" });
    return roots;
  }
  async isPotentiallyBlockingPath(target, signal) {
    signal.throwIfAborted();
    const normalized = path3.resolve(target);
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
      { name: "\u4E3B\u76EE\u5F55", path: homedir2(), kind: "home" },
      { name: "\u6839\u76EE\u5F55", path: "/", kind: "filesystem" }
    ];
    for (const mountRoot of ["/mnt", "/media"]) {
      if (existsSync2(mountRoot)) roots.push({ name: path3.basename(mountRoot), path: mountRoot, kind: "volume" });
    }
    return roots;
  }
  async isPotentiallyBlockingPath(target, signal) {
    signal.throwIfAborted();
    const normalized = path3.resolve(target);
    return normalized.startsWith("/mnt/") || normalized.startsWith("/media/") || /\/run\/user\/\d+\/gvfs(?:\/|$)/.test(normalized);
  }
};
var UnknownPlatformAdapter = class extends BasePlatformAdapter {
  descriptor = Object.freeze({
    kind: "unknown",
    name: "Unknown",
    pathStyle: path3.sep === "\\" ? "windows" : "posix",
    directoryRootStyle: path3.sep === "\\" ? "drives" : "filesystem"
  });
  async filesystemRoots(signal) {
    signal.throwIfAborted();
    return [{ name: "\u4E3B\u76EE\u5F55", path: homedir2(), kind: "home" }];
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
function hostPlatformDescriptor() {
  return hostPlatform.descriptor;
}
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

// src/node-storage.ts
import { createHash, createPrivateKey, createPublicKey, randomBytes as randomBytes2 } from "node:crypto";
import { existsSync as existsSync3, mkdirSync as mkdirSync2, readFileSync as readFileSync3, readdirSync, renameSync as renameSync2, rmSync as rmSync2, rmdirSync } from "node:fs";
import path4 from "node:path";
var legacyNames = {
  "identity.json": "harness-remote-public-identity.json",
  "gate-wechat-state.json": "gate-wechat-state.json",
  "public.json": "harness-remote-public.json"
};
function nodeStorageDirectory(home, profile) {
  const scope = ["web", "default"].includes(profile.toLowerCase()) ? "web" : profile;
  const key = createHash("sha256").update(`deepseek-harness\0${scope}`).digest("hex").slice(0, 24);
  return path4.join(home, "harness-remote", "instances", key);
}
function installedNodeStatePaths(home, profile) {
  const directory = nodeStorageDirectory(home, profile);
  const legacy = ["web", "default"].includes(profile.toLowerCase()) && !existsSync3(path4.join(directory, "storage-layout.json"));
  return {
    stateFile: legacy ? path4.join(home, legacyNames["gate-wechat-state.json"]) : path4.join(directory, "gate-wechat-state.json"),
    identityFile: legacy ? path4.join(home, legacyNames["identity.json"]) : path4.join(directory, "identity.json")
  };
}

// src/agent-metadata.ts
var cachedDescriptors = /* @__PURE__ */ new Map();
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
function stableId(file) {
  if (existsSync4(file)) {
    const stored = readPrivateJson(file);
    if (stored.version !== 1 || !/^[A-Za-z0-9_-]{20,64}$/.test(stored.id)) {
      throw new Error(`Harness Remote metadata is invalid: ${path5.basename(file)}`);
    }
    return stored.id;
  }
  const id = randomBytes3(18).toString("base64url");
  if (createPrivateJsonAtomic(file, { version: 1, id })) return id;
  return stableId(file);
}
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
  const relative = path5.relative(path5.join(dshHome, "profiles"), modulePath);
  const parts = relative.split(/[\\/]/);
  if (valid(parts[0]) && parts[1] === "node_modules") return parts[0];
  if (argv[2] === "web") return "web";
  return "default";
}
function instanceStorageKey(profileScope = agentProfileScope()) {
  return createHash2("sha256").update(`deepseek-harness\0${profileScope}`).digest("hex").slice(0, 24);
}
function agentDisplayName(ctx) {
  const profile = agentProfileScope(ctx);
  if (profile === "desktop") return "DeepSeek Harness \xB7 Desktop";
  if (profile === "web" || profile === "default") return "DeepSeek Harness \xB7 Web";
  return "DeepSeek Harness";
}
function packageVersionFromAncestors(start) {
  let current = path5.resolve(start);
  for (let depth = 0; depth < 8; depth += 1) {
    const manifest = path5.join(current, "package.json");
    try {
      const value = JSON.parse(readFileSync4(manifest, "utf8"));
      if (value.name === "@deepseek-ai/dsh" && typeof value.version === "string" && value.version) {
        return value.version;
      }
    } catch {
    }
    const parent = path5.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}
function installedDshVersion(ctx) {
  if (dshProfileFacts(ctx)) return hostRuntimeVersion(ctx);
  const override = process.env.DSH_RUNTIME_VERSION;
  if (override && /^[A-Za-z0-9._+-]{1,64}$/.test(override)) return override;
  const argvEntry = process.argv[1];
  if (argvEntry) {
    let resolvedEntry = argvEntry;
    try {
      resolvedEntry = realpathSync2(argvEntry);
    } catch {
    }
    const found = packageVersionFromAncestors(path5.dirname(resolvedEntry));
    if (found) return found;
  }
  for (const entry of String(process.env.PATH || "").split(path5.delimiter)) {
    if (!entry) continue;
    try {
      const command = path5.join(entry, process.platform === "win32" ? "dsh.cmd" : "dsh");
      const found = packageVersionFromAncestors(path5.dirname(realpathSync2(command)));
      if (found) return found;
    } catch {
    }
    try {
      const value = JSON.parse(readFileSync4(
        path5.join(entry, "node_modules", "@deepseek-ai", "dsh", "package.json"),
        "utf8"
      ));
      if (value.name === "@deepseek-ai/dsh" && typeof value.version === "string" && value.version) {
        return value.version;
      }
    } catch {
    }
  }
  return "unknown";
}
function loadAgentDescriptor(ctx) {
  const root = path5.join(agentDshHome(ctx), "harness-remote");
  const instancePath = path5.join(root, "instances", instanceStorageKey(agentProfileScope(ctx)), "agent.json");
  const cached = cachedDescriptors.get(instancePath);
  if (cached) return cached;
  const agentVersion = installedDshVersion(ctx);
  const descriptor = {
    schemaVersion: 1,
    hostId: stableId(path5.join(root, "host.json")),
    agentInstanceId: stableId(instancePath),
    hostName: hostname(),
    agentKind: "deepseek-harness",
    agentName: agentDisplayName(ctx),
    agentVersion,
    hostPlatform: hostPlatformDescriptor(),
    capabilities: AGENT_CAPABILITIES
  };
  cachedDescriptors.set(instancePath, descriptor);
  return descriptor;
}

// src/gate-ports.ts
import { createHash as createHash3 } from "node:crypto";
var LEGACY_PUBLIC_PORT = 3092;
var LEGACY_LOCAL_PORT = 3093;
var DYNAMIC_PORT_BASE = 32e3;
var DYNAMIC_PORT_PAIRS = 4e3;
function validPort2(value) {
  if (value === void 0 || value === "") return null;
  if (!/^\d{1,5}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : null;
}
function isLegacyProfile(profileScope) {
  const normalized = profileScope.trim().toLowerCase();
  return normalized === "web" || normalized === "default";
}
function deriveGatePorts(profileScope, agentInstanceId, environment = process.env) {
  const warnings = [];
  const legacy = isLegacyProfile(profileScope);
  const digest = createHash3("sha256").update(`harness-remote-gate-v1\0${profileScope}\0${agentInstanceId}`).digest();
  const pair = digest.readUInt32BE(0) % DYNAMIC_PORT_PAIRS;
  const derivedPublic = legacy ? LEGACY_PUBLIC_PORT : DYNAMIC_PORT_BASE + pair * 2;
  const derivedLocal = legacy ? LEGACY_LOCAL_PORT : derivedPublic + 1;
  const publicOverride = validPort2(environment.WECHAT_GATE_PORT);
  const localOverride = validPort2(environment.WECHAT_GATE_LOCAL_PORT);
  if (environment.WECHAT_GATE_PORT && publicOverride === null) {
    warnings.push(`\u5FFD\u7565\u65E0\u6548\u7684 WECHAT_GATE_PORT=${environment.WECHAT_GATE_PORT}`);
  }
  if (environment.WECHAT_GATE_LOCAL_PORT && localOverride === null) {
    warnings.push(`\u5FFD\u7565\u65E0\u6548\u7684 WECHAT_GATE_LOCAL_PORT=${environment.WECHAT_GATE_LOCAL_PORT}`);
  }
  const publicPort = publicOverride ?? derivedPublic;
  const localPort = localOverride ?? derivedLocal;
  if (publicPort === localPort) {
    warnings.push(`\u516C\u7F51\u95E8\u4E0E\u672C\u5730\u95E8\u90FD\u914D\u7F6E\u4E3A ${publicPort}\uFF1B\u5176\u4E2D\u4E00\u6247\u95E8\u5C06\u65E0\u6CD5\u76D1\u542C`);
  }
  return {
    profileScope,
    publicPort,
    localPort,
    source: publicOverride !== null || localOverride !== null ? "environment-override" : legacy ? "legacy-default" : "profile-derived",
    warnings
  };
}

// src/dsh-protocol-compat.ts
import { setTimeout as delay } from "node:timers/promises";

// src/dsh-session-address.ts
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function unavailable(message, sessionId, reason) {
  throw Object.assign(new Error(message), {
    code: "adapter/session-address-unavailable",
    details: { sessionId, reason }
  });
}
async function resolveDshSessionAddress(gateway, sessionId, signal) {
  signal.throwIfAborted();
  if (!sessionId || sessionId.length > 256) unavailable("\u4F1A\u8BDD\u6807\u8BC6\u65E0\u6548", sessionId, "invalid-id");
  const listing = record(await gateway.invoke({
    namespace: "session",
    method: "list",
    args: { _request: {} },
    signal
  }));
  signal.throwIfAborted();
  if (!Array.isArray(listing?.items)) unavailable("DSH \u4F1A\u8BDD\u76EE\u5F55\u6682\u4E0D\u53EF\u7528", sessionId, "invalid-directory");
  const rows = listing.items.map(record).filter((row2) => row2?.sessionId === sessionId);
  if (rows.length !== 1) unavailable("\u4F1A\u8BDD\u4E0D\u5B58\u5728\u6216\u6682\u4E0D\u53EF\u8BFB\u53D6\uFF0C\u8BF7\u5237\u65B0\u4F1A\u8BDD\u5217\u8868", sessionId, "missing-session");
  const row = rows[0];
  if (row.origin !== "subagent") return { kind: "session", sessionId };
  const parentSessionId = row.parentSessionId;
  if (typeof parentSessionId !== "string" || !parentSessionId || parentSessionId === sessionId) {
    unavailable("\u5B50\u4EE3\u7406\u4F1A\u8BDD\u7F3A\u5C11\u6709\u6548\u7684\u7236\u4F1A\u8BDD\u6807\u8BC6", sessionId, "invalid-parent");
  }
  const catalog = record(await gateway.invoke({
    namespace: "subagents",
    method: "list",
    args: { parentSessionId },
    signal
  }));
  signal.throwIfAborted();
  if (!Array.isArray(catalog?.entries)) unavailable("DSH \u5B50\u4EE3\u7406\u76EE\u5F55\u6682\u4E0D\u53EF\u7528", sessionId, "invalid-catalog");
  const children = catalog.entries.map(record).filter((entry) => entry?.id === sessionId);
  if (children.length !== 1) unavailable("\u5B50\u4EE3\u7406\u4F1A\u8BDD\u6682\u4E0D\u53EF\u8BFB\u53D6\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5", sessionId, "missing-child");
  const child = children[0];
  if (child.kind !== "child" || child.mode !== "one-shot" && child.mode !== "continuable") {
    unavailable(
      "DSH \u65E0\u6CD5\u8BC6\u522B\u6B64\u5B50\u4EE3\u7406\u4F1A\u8BDD\uFF0C\u8BF7\u5728\u7535\u8111\u7AEF\u68C0\u67E5\u8BE5\u4F1A\u8BDD",
      sessionId,
      typeof child.reason === "string" ? child.reason : "unsupported-child"
    );
  }
  return { kind: "subagent", parentSessionId, childSessionId: sessionId, mode: child.mode };
}

// src/session-presentation.ts
var object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
function numbers(v, names) {
  return Object.fromEntries(names.flatMap(([from, to]) => typeof v[from] === "number" && Number.isFinite(v[from]) && Number(v[from]) >= 0 ? [[to, v[from]]] : []));
}
function presentationProjection(key, raw) {
  const base = object(raw), v = base.values ? object(base.values) : base;
  let name, value;
  switch (key) {
    case "sessionStats":
      name = "metrics";
      value = numbers(v, [["turns", "turns"], ["steps", "steps"], ["toolMs", "toolMs"], ["llmMs", "modelMs"], ["ttftMs", "firstTokenMs"], ["ttftSteps", "firstTokenSamples"], ["decodeMs", "decodeMs"], ["decodeTokens", "decodeTokens"]]);
      break;
    case "tokenUsage":
      name = "usage";
      value = numbers(v, [["uncachedInputTokens", "input"], ["outputTokens", "output"], ["cacheReadTokens", "cacheRead"], ["cacheWriteTokens", "cacheWrite"]]);
      break;
    case "contextPressure":
      name = "context";
      value = { estimated: true, ...numbers(v, [[v.projectedTokens === void 0 ? "pressureTokens" : "projectedTokens", "used"], ["contextWindow", "capacity"]]) };
      break;
    case "contextBreakdown":
      name = "composition";
      value = numbers(v, [["systemTokens", "system"], ["toolsTokens", "tools"], ["messageTokens", "messages"]]);
      break;
    case "plan":
      name = "planMode";
      value = { active: v.active === true, pending: v.pending === true };
      break;
    case "todos":
      name = "plan";
      value = Array.isArray(raw) ? { steps: raw.map((t) => ({ text: object(t).content, status: object(t).status })) } : null;
      break;
    case "goal": {
      name = "goal";
      const goal = object(base.goal);
      value = base.goal ? { id: goal.id, revision: goal.revision, text: goal.objective, status: goal.phase, rounds: base.roundsStarted, roundLimit: goal.maxGoalRounds, reason: object(goal.blockedReason).message } : null;
      break;
    }
    default:
      return null;
  }
  return { key: `agent.${name}.v1`, value };
}
function withPresentationProjections(block) {
  const source = object(block);
  if (!source.values) return block;
  const values = { ...object(source.values) };
  for (const [key, value] of Object.entries(values)) {
    const projected = presentationProjection(key, value);
    if (projected) values[projected.key] = projected.value;
  }
  return { ...source, values };
}

// src/dsh-host-contract.ts
var contracts = /* @__PURE__ */ new WeakMap();
function usesDuplexEvents(version) {
  if (!version) return false;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.exec(version);
  if (!match) throw new Error("\u65E0\u6CD5\u8BC6\u522B\u5F53\u524D DSH \u4E8B\u4EF6\u534F\u8BAE\u7248\u672C");
  const [, major, minor, patch] = match.map(Number);
  return major > 0 || minor > 1 || minor === 1 && patch >= 7;
}
function openHostEvents(gateway, endpoint, payload, signal, ctx) {
  let contract = contracts.get(gateway);
  if (!contract) {
    contract = { duplex: usesDuplexEvents(hostRuntimeVersion(ctx)) };
    contracts.set(gateway, contract);
  }
  signal.throwIfAborted();
  const empty = { async *[Symbol.asyncIterator]() {
  } };
  return contract.duplex ? gateway.wireStream.open(endpoint, payload, empty, void 0, signal) : gateway.wireStream.open(endpoint, payload, signal);
}
function projectedSubagentCatalog(parent, projection, rows) {
  const entries = projection?.values?.subagentCatalog;
  if (!Array.isArray(entries) || !Array.isArray(rows)) throw new Error("DSH \u5B50\u4EE3\u7406\u76EE\u5F55\u6682\u4E0D\u53EF\u8BFB\u53D6");
  const byId = new Map(rows.map((row) => [row.sessionId, row]));
  const parents = new Set(rows.filter((row) => row.origin === "subagent").map((row) => row.parentSessionId));
  const ids = /* @__PURE__ */ new Set();
  return { parentAvailable: byId.get(parent)?.agentAvailable === true, entries: entries.map((entry) => {
    if (typeof entry.id !== "string" || !entry.id || ids.has(entry.id)) throw new Error("DSH \u5B50\u4EE3\u7406\u76EE\u5F55\u4E0D\u5B8C\u6574");
    ids.add(entry.id);
    if (entry.mode !== "one-shot" && entry.mode !== "continuable") return { id: entry.id, kind: "diagnostic", reason: "unsupported" };
    const row = byId.get(entry.id);
    if (row && (row.origin !== "subagent" || row.parentSessionId !== parent)) throw new Error("DSH \u5B50\u4EE3\u7406\u5F52\u5C5E\u4E0D\u4E00\u81F4");
    return {
      id: entry.id,
      kind: "child",
      mode: entry.mode,
      ...typeof entry.label === "string" ? { label: entry.label } : {},
      activity: row?.running === true ? "running" : "inactive",
      hasChildren: parents.has(entry.id)
    };
  }) };
}
async function invokeHostRemote(ctx, gateway, request) {
  if (request.namespace === "settings" && request.method === "update" && request.args?.ns === "agent-presets" && request.args.patch && Object.hasOwn(request.args.patch, "default")) {
    request.signal?.throwIfAborted();
    const description = await gateway.invoke({ namespace: "settings", method: "describe", args: {}, signal: request.signal });
    request.signal?.throwIfAborted();
    const rows = description?.namespaces;
    if (!Array.isArray(rows)) throw new Error("DSH \u9884\u8BBE\u914D\u7F6E\u6682\u4E0D\u53EF\u8BFB\u53D6\uFF0C\u672A\u4FEE\u6539\u9ED8\u8BA4\u9884\u8BBE");
    const old = rows.filter((row2) => row2.ns === "agent-presets");
    const modern = rows.filter((row2) => row2.ns === "agent-preset-registry");
    if (old.length === 1 && modern.length === 0) return gateway.invoke(request);
    if (modern.length !== 1 || old.length !== 0) throw new Error("DSH \u9884\u8BBE\u914D\u7F6E\u5165\u53E3\u4E0D\u552F\u4E00\u6216\u672A\u5C31\u7EEA\uFF0C\u672A\u4FEE\u6539\u9ED8\u8BA4\u9884\u8BBE");
    if (Object.keys(request.args.patch).length !== 1 || typeof request.args.patch.default !== "string") {
      throw new Error("\u9ED8\u8BA4\u9884\u8BBE\u8BBE\u7F6E\u53C2\u6570\u65E0\u6548");
    }
    if (request.args.expectedRevision !== void 0) throw new Error("\u9884\u8BBE\u914D\u7F6E\u5DF2\u8FC1\u79FB\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5");
    const row = modern[0];
    if (!Number.isSafeInteger(row.revision)) throw new Error("DSH \u9884\u8BBE\u914D\u7F6E\u7248\u672C\u65E0\u6548");
    return gateway.invoke({ ...request, args: {
      ns: row.ns,
      patch: { selectedDefault: request.args.patch.default },
      expectedRevision: row.revision
    } });
  }
  if (request.namespace !== "subagents" || request.method !== "list") return gateway.invoke(request);
  const registry = ctx.get("typert")?.local;
  if (registry?.get("subagents/list") || registry?.hasSeen?.("subagents/list") || !usesDuplexEvents(hostRuntimeVersion(ctx))) return gateway.invoke(request);
  const parent = request.args.parentSessionId;
  if (typeof parent !== "string" || !parent || parent.length > 256) throw new Error("\u7236\u4F1A\u8BDD\u6807\u8BC6\u65E0\u6548");
  request.signal?.throwIfAborted();
  const [projection, listing] = await Promise.all([
    gateway.invoke({ namespace: "session", method: "projections", args: { request: { sessionId: parent } }, signal: request.signal }),
    gateway.invoke({ namespace: "session", method: "list", args: { _request: {} }, signal: request.signal })
  ]);
  request.signal?.throwIfAborted();
  return projectedSubagentCatalog(parent, projection, listing?.items);
}

// src/dsh-protocol-compat.ts
var SINGLE_REQUEST_METHODS = /* @__PURE__ */ new Set([
  "session.attachment",
  "session.cancel",
  "session.create",
  "session.fork",
  "session.openWorkspacePath",
  "session.rename",
  "session.search",
  "session.selectModel",
  "session.updateQueue",
  "workspace.archiveSession",
  "workspace.create",
  "workspace.delete",
  "workspace.insertBefore",
  "workspace.insertSessionBefore",
  "workspace.rename"
]);
function recordOf(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function present(value, key) {
  return Object.hasOwn(value, key) ? { [key]: value[key] } : {};
}
function requestInvocation(method, payload) {
  const [namespace, remoteMethod] = method.split(".", 2);
  return {
    kind: "invoke",
    namespace,
    method: remoteMethod,
    args: { request: payload }
  };
}
function planLegacyRpc(request) {
  const { method, payload } = request;
  if (method.includes("/")) {
    const split = method.indexOf("/");
    const namespace = method.slice(0, split);
    const remoteMethod = method.slice(split + 1);
    if (!namespace || !remoteMethod || remoteMethod.includes("/")) {
      throw new Error(`unsupported Remote endpoint: ${method}`);
    }
    const supplied = recordOf(payload.args);
    if (namespace === "commands" && remoteMethod === "execute") {
      const args = supplied ?? {};
      const line = typeof args.line === "string" ? args.line.trim() : "";
      if (/^\/permission(?:\s|$)/.test(line)) {
        const match = /^\/permission(?:[ \t]+([a-z][a-z0-9-]*))?[ \t]*$/.exec(line);
        if (!match || typeof args.agentId !== "string" || !args.agentId.trim() || ["images", "submittedAttachments"].some((key) => args[key] !== void 0 && (!Array.isArray(args[key]) || args[key].length))) {
          throw Object.assign(new Error("\u6743\u9650\u547D\u4EE4\u683C\u5F0F\u65E0\u6548\uFF1B\u672A\u66F4\u6539\u6743\u9650"), { code: "adapter/invalid-permission-command" });
        }
        return { kind: "permission-command", sessionId: args.agentId, line, nativeReceipt: true, ...match[1] ? { preset: match[1] } : {} };
      }
      const images = Array.isArray(args.images) ? args.images : [];
      return { kind: "invoke", namespace, method: remoteMethod, args: {
        ...args,
        images,
        submittedAttachments: args.submittedAttachments ?? images.map((image) => ({ ...recordOf(image), type: "image" }))
      } };
    }
    return { kind: "invoke", namespace, method: remoteMethod, args: supplied ?? {} };
  }
  if (method === "host.describe") return { kind: "host-describe" };
  if (method === "workspace.list") return { kind: "workspace-list" };
  if (method === "session.history") {
    return { kind: "session-history", request: payload };
  }
  if (method === "session.list") {
    return {
      kind: "invoke",
      namespace: "session",
      method: "list",
      args: { _request: payload }
    };
  }
  if (method === "session.models") {
    return { kind: "session-models", request: payload };
  }
  if (method === "session.prompt") {
    const parts = Array.isArray(payload.content) ? payload.content : [];
    const first = recordOf(parts[0]);
    const text = first?.type === "text" && typeof first.text === "string" ? first.text.trim() : "";
    if (/^\/permission(?:\s|$)/.test(text)) {
      const match = /^\/permission(?:[ \t]+([a-z][a-z0-9-]*))?[ \t]*$/.exec(text);
      if (!match || parts.length !== 1 || typeof payload.sessionId !== "string" || !payload.sessionId.trim()) {
        throw Object.assign(new Error("\u6743\u9650\u547D\u4EE4\u683C\u5F0F\u65E0\u6548\uFF1B\u672A\u53D1\u9001\u804A\u5929\u6D88\u606F\uFF0C\u4E5F\u672A\u66F4\u6539\u6743\u9650"), { code: "adapter/invalid-permission-command" });
      }
      return {
        kind: "permission-command",
        sessionId: payload.sessionId,
        line: text,
        ...match[1] ? { preset: match[1] } : {}
      };
    }
    return requestInvocation(method, {
      ...payload,
      requestId: typeof payload.requestId === "string" && payload.requestId ? payload.requestId : request.rpcId
    });
  }
  if (SINGLE_REQUEST_METHODS.has(method)) return requestInvocation(method, payload);
  if (method === "host.openPath") {
    return {
      kind: "invoke",
      namespace: "session",
      method: "openWorkspacePath",
      args: { request: payload }
    };
  }
  if (method === "agentPreset.list") {
    return { kind: "invoke", namespace: "agentPresets", method: "list", args: {} };
  }
  if (method === "agentPreset.select") {
    return {
      kind: "invoke",
      namespace: "agentPresets",
      method: "select",
      args: { agentId: payload.sessionId, agentPreset: payload.agentPreset },
      transform: (value) => ({ agentPreset: value })
    };
  }
  if (method === "settings.update") {
    return {
      kind: "invoke",
      namespace: "settings",
      method: "update",
      args: {
        ns: payload.ns,
        patch: payload.patch,
        ...present(payload, "expectedRevision")
      }
    };
  }
  if (method === "llm.providers") {
    return {
      kind: "invoke",
      namespace: "llm",
      method: "listConfigurableProviders",
      args: {},
      transform: (value) => ({ providers: Array.isArray(value) ? value : [] })
    };
  }
  if (method === "llm.models") {
    return {
      kind: "invoke",
      namespace: "session",
      method: "modelCatalog",
      args: {}
    };
  }
  if (method === "subagent.list") {
    return {
      kind: "invoke",
      namespace: "subagents",
      method: "list",
      args: { parentSessionId: payload.parentSessionId }
    };
  }
  if (method === "subagent.interrupt") {
    return {
      kind: "invoke",
      namespace: "subagents",
      method: "interruptByParent",
      args: {
        childSessionId: payload.childSessionId,
        parentSessionId: payload.parentSessionId,
        mode: payload.mode
      }
    };
  }
  if (method.startsWith("goal.")) {
    const remoteMethod = method.slice("goal.".length);
    const args = { agentId: payload.sessionId };
    const mutation = {
      ...present(payload, "objective"),
      ...present(payload, "maxGoalRounds")
    };
    if (remoteMethod === "create") args.request = mutation;
    else {
      args.ref = payload.ref;
      if (remoteMethod === "edit") args.request = mutation;
    }
    return {
      kind: "invoke",
      namespace: "goals",
      method: remoteMethod,
      args,
      transform: (value) => {
        if (remoteMethod === "create") return value;
        if (remoteMethod === "clear") return { cleared: true };
        const goal = recordOf(value);
        return { ref: { id: goal?.id, revision: goal?.revision } };
      }
    };
  }
  throw new Error(`unsupported legacy DSH RPC: ${method}`);
}
function resolveTypertGateway(ctx) {
  const candidate = ctx.get("typertGateway");
  if (!candidate || typeof candidate.invoke !== "function" || typeof candidate.stream !== "function") return null;
  return {
    wireStream: candidate.wireStream ? { open: (endpoint, payload, signal) => openHostEvents(candidate, endpoint, payload, signal, ctx) } : void 0,
    invoke: (request) => invokeHostRemote(ctx, candidate, request),
    stream: (request) => candidate.stream(request),
    commandAttachmentField: () => {
      const registry = ctx.get("typert");
      const descriptor = registry?.local?.get("commands/execute");
      if (descriptor) {
        const fields = descriptor.parameters?.map((parameter) => parameter.wire) || [];
        if (fields.includes("submittedAttachments") && !fields.includes("images")) return "submittedAttachments";
        if (fields.includes("images") && !fields.includes("submittedAttachments")) return "images";
        throw new Error("DSH \u547D\u4EE4\u9644\u4EF6\u53C2\u6570\u5DF2\u53D8\u66F4\uFF1B\u672A\u6267\u884C\u547D\u4EE4");
      }
      if (registry?.local?.hasSeen?.("commands/execute")) throw new Error("DSH \u547D\u4EE4\u63A5\u53E3\u6B63\u5728\u66F4\u65B0\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
      return ctx.get("fileUploads") ? "submittedAttachments" : "images";
    }
  };
}
function commandArguments(gateway, args) {
  const field = gateway.commandAttachmentField?.() || "images";
  const { images, submittedAttachments, ...rest } = args;
  const value = field === "submittedAttachments" ? submittedAttachments ?? (Array.isArray(images) ? images.map((image) => ({ ...recordOf(image), type: "image" })) : []) : images ?? [];
  if (field === "images" && Array.isArray(submittedAttachments) && submittedAttachments.some((part) => recordOf(part)?.type !== "image")) throw new Error("\u6B64\u7248\u672C DSH \u547D\u4EE4\u4E0D\u652F\u6301\u6587\u4EF6\u9644\u4EF6");
  return { ...rest, [field]: value };
}
function errorResult(error) {
  const value = recordOf(error);
  const code = typeof value?.code === "string" && value.code ? value.code : "adapter/internal";
  const message = error instanceof Error && error.message ? error.message : typeof value?.message === "string" && value.message ? value.message : String(error);
  return {
    ok: false,
    error: {
      code,
      message,
      ...value && Object.hasOwn(value, "details") ? { details: value.details } : {}
    }
  };
}
function historyEvents(records) {
  if (!Array.isArray(records)) return [];
  return records.flatMap((record2) => {
    const row = recordOf(record2);
    const event = recordOf(row?.event);
    if (row?.type === "event" && event) return [{ event }];
    if (row?.type !== "chunks" || !event) return [];
    return unpackChunkRow(event).map((item) => ({ event: item }));
  });
}
function unpackChunkRow(event) {
  const data = recordOf(event.data);
  if (!data || !Number.isSafeInteger(event.seq) || !Number.isSafeInteger(event.time)) return [];
  const type = event.type;
  const members = type === "chunkrow/tool-call-chunks" ? data.args : data.texts;
  if (!Array.isArray(members) || members.length === 0 || members.some((item) => typeof item !== "string")) return [];
  const gaps = Array.isArray(data.dt) ? data.dt : [];
  if (gaps.length !== members.length - 1 || gaps.some((gap) => !Number.isSafeInteger(gap))) return [];
  let time = Number(event.time);
  return members.map((member, index) => {
    if (index > 0) time += Number(gaps[index - 1]);
    let chunk;
    if (type === "chunkrow/text-chunks") {
      chunk = { type: "text-delta", index: data.index, text: member };
    } else if (type === "chunkrow/reasoning-chunks") {
      chunk = { type: "reasoning-delta", index: data.index, text: member };
    } else if (type === "chunkrow/tool-call-chunks") {
      chunk = {
        type: "tool-call-delta",
        index: data.index,
        id: data.id,
        ...present(data, "name"),
        argumentsDelta: member
      };
    } else return {};
    return {
      type: "assistant/chunk",
      seq: Number(event.seq) + index,
      time,
      data: { turn: data.turn, step: data.step, chunk }
    };
  }).filter((item) => typeof item.type === "string");
}
async function firstStreamFrame(gateway, namespace, method, args, signal) {
  const iterable = await gateway.stream({ namespace, method, args, signal });
  const iterator = iterable[Symbol.asyncIterator]();
  try {
    const first = await iterator.next();
    if (first.done) throw new Error(`${namespace}/${method} ended before its baseline`);
    return first.value;
  } finally {
    await iterator.return?.();
  }
}
async function historyValue(gateway, request, signal) {
  const sessionId = typeof request.sessionId === "string" ? request.sessionId : "";
  if (!sessionId) throw new Error("session.history requires sessionId");
  const maxMessages = Number.isSafeInteger(request.maxMessages) ? Math.max(1, Math.min(30, Number(request.maxMessages))) : 8;
  return createHistoryPageReader(gateway, sessionId, signal)({
    maxMessages,
    ...Number.isSafeInteger(request.beforeSeq) ? { beforeSeq: Number(request.beforeSeq) } : {}
  });
}
function createHistoryPageReader(gateway, sessionId, signal) {
  let address;
  let opening;
  const readPage = async (request, throughSeq) => {
    const resolved = await (address ??= resolveDshSessionAddress(gateway, sessionId, signal));
    signal.throwIfAborted();
    const page = recordOf(await gateway.invoke({
      namespace: "session",
      method: "page",
      args: { request: { address: resolved, throughSeq, beforeSeq: request.beforeSeq, maxMessages: request.maxMessages } },
      signal
    })) ?? {};
    signal.throwIfAborted();
    return { events: historyEvents(page.records), hasMore: page.hasMore === true };
  };
  return async (request) => {
    signal.throwIfAborted();
    if (!opening && request.beforeSeq !== void 0) {
      return readPage(request, request.beforeSeq - 1);
    }
    if (!opening) {
      opening = (async () => {
        const resolved = await (address ??= resolveDshSessionAddress(gateway, sessionId, signal));
        signal.throwIfAborted();
        const maxMessages2 = request.maxMessages;
        const first2 = recordOf(await firstStreamFrame(gateway, "session", "follow", {
          request: { address: resolved, maxMessages: maxMessages2 }
        }, signal));
        signal.throwIfAborted();
        if (first2?.type !== "snapshot" || !Number.isSafeInteger(first2.cursor) || Number(first2.cursor) < -1) {
          throw new Error("session/follow returned an invalid opening snapshot");
        }
        return { first: first2, maxMessages: maxMessages2 };
      })();
    }
    const { first, maxMessages } = await opening;
    signal.throwIfAborted();
    const latest = request.beforeSeq === void 0;
    if (latest && request.maxMessages === maxMessages) {
      return {
        events: historyEvents(first.records),
        hasMore: first.hasMore === true,
        projections: withPresentationProjections(first.projections),
        historyEndSeq: first.cursor
      };
    }
    const page = await readPage(request, Number(first.cursor));
    return {
      ...page,
      ...latest ? {
        projections: withPresentationProjections(first.projections),
        historyEndSeq: first.cursor
      } : {}
    };
  };
}
async function workspaceValue(gateway, signal) {
  const frame = recordOf(await firstStreamFrame(
    gateway,
    "workspace",
    "follow",
    {},
    signal
  ));
  if (frame?.type !== "baseline" || !recordOf(frame.value)) {
    throw new Error("workspace/follow returned an invalid baseline");
  }
  return frame.value;
}
async function permissionCommandValue(gateway, plan, signal, readHistory, flushPermission) {
  signal.throwIfAborted();
  const command = recordOf(await gateway.invoke({
    namespace: "commands",
    method: "execute",
    args: commandArguments(gateway, { agentId: plan.sessionId, line: plan.line, images: [], submittedAttachments: [] }),
    signal
  }));
  const result = recordOf(command?.result);
  if (result?.kind !== "success") {
    throw Object.assign(new Error(typeof result?.text === "string" && result.text ? result.text : "DSH \u672A\u6210\u529F\u6267\u884C\u6743\u9650\u547D\u4EE4\uFF1B\u8BF7\u68C0\u67E5\u4E3B\u673A\u6743\u9650\u9884\u8BBE\u670D\u52A1"), { code: "adapter/command-failed" });
  }
  await flushPermission?.(plan.sessionId);
  signal.throwIfAborted();
  const history = recordOf(await readHistory(plan.sessionId, signal));
  const permissions = recordOf(recordOf(recordOf(history?.projections)?.values)?.permissions);
  const current = permissions?.currentValue;
  if (typeof current !== "string" || plan.preset && current !== plan.preset) {
    throw Object.assign(new Error("\u6743\u9650\u547D\u4EE4\u5DF2\u6267\u884C\uFF0C\u4F46\u672A\u786E\u8BA4\u76EE\u6807\u6743\u9650\uFF1B\u8BF7\u5237\u65B0\u4F1A\u8BDD\u6838\u5BF9\u5F53\u524D\u6743\u9650"), {
      code: "adapter/permission-not-applied"
    });
  }
  return plan.nativeReceipt ? command : { accepted: true, command: true, permission: current, commandId: command?.commandId };
}
async function sessionModelsValue(gateway, request, signal) {
  const sessionId = typeof request.sessionId === "string" ? request.sessionId : "";
  if (!sessionId) throw new Error("session.models requires sessionId");
  const address = await resolveDshSessionAddress(gateway, sessionId, signal);
  const [rawCatalog, rawSnapshot] = await Promise.all([
    gateway.invoke({ namespace: "session", method: "modelCatalog", args: {}, signal }),
    firstStreamFrame(gateway, "session", "follow", {
      request: { address, maxMessages: 1 }
    }, signal)
  ]);
  const catalog = recordOf(rawCatalog);
  const snapshot = recordOf(rawSnapshot);
  const projections = recordOf(snapshot?.projections);
  const selection = recordOf(recordOf(projections?.values)?.modelSelection);
  if (!catalog || snapshot?.type !== "snapshot" || !projections) {
    throw new Error("DSH returned an invalid model catalog or Session snapshot");
  }
  const current = selection?.next ?? selection?.lastUsed ?? catalog.default;
  if (!recordOf(current)) throw new Error("DSH returned no usable model selection");
  return { ...catalog, current };
}
async function invokeLegacyRpc(gateway, request, options) {
  let result;
  try {
    const plan = planLegacyRpc(request);
    let value;
    if (plan.kind === "host-describe") value = options.describeHost();
    else if (plan.kind === "workspace-list") value = await workspaceValue(gateway, options.signal);
    else if (plan.kind === "session-history") value = await historyValue(gateway, plan.request, options.signal);
    else if (plan.kind === "session-models") value = await sessionModelsValue(gateway, plan.request, options.signal);
    else if (plan.kind === "permission-command") value = await permissionCommandValue(
      gateway,
      plan,
      options.signal,
      (sessionId, signal) => historyValue(gateway, { sessionId, maxMessages: 1 }, signal),
      options.flushPermission
    );
    else {
      for (let attempt = 0; ; attempt++) {
        try {
          options.signal.throwIfAborted();
          value = await gateway.invoke({
            namespace: plan.namespace,
            method: plan.method,
            args: plan.namespace === "commands" && plan.method === "execute" ? commandArguments(gateway, plan.args) : plan.args,
            signal: options.signal
          });
          break;
        } catch (error) {
          const failure = recordOf(error);
          if (request.method !== "session.list" || attempt >= 2 || failure?.code !== "SESSION_QUERY_PERSISTENCE_FAILED" || typeof failure.message !== "string" || !/ENOENT.*scandir.*[\\/]\.dsh-mkdir-[^\\/]+$/.test(failure.message)) throw error;
          await delay(25 * (attempt + 1), void 0, { signal: options.signal });
        }
      }
      if (plan.transform) value = plan.transform(value);
    }
    result = { ok: true, value };
  } catch (error) {
    result = errorResult(error);
  }
  return { type: "server-response", rpcId: request.rpcId, result };
}

// src/install-lifecycle.ts
import fs from "node:fs";
import path6 from "node:path";
import { execFileSync as execFileSync2, spawn } from "node:child_process";
var serviceName = (s) => /^[A-Za-z0-9_.@-]{1,180}$/.test(s);
function run(command, args) {
  return execFileSync2(command, args, { encoding: "utf8", windowsHide: true, timeout: 15e3, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function validateManager(value) {
  if (value.kind === "process") return;
  if (value.kind === "systemd" && process.platform === "linux" && serviceName(value.unit) && value.unit.endsWith(".service")) return;
  if (value.kind === "launchd" && process.platform === "darwin" && serviceName(value.label) && /^gui\/\d+$/.test(value.domain) && value.domain === `gui/${process.getuid?.()}` && path6.isAbsolute(value.plist) && fs.statSync(value.plist).isFile()) return;
  throw new Error("\u65E0\u6CD5\u786E\u8BA4\u539F\u540E\u53F0\u670D\u52A1\uFF0C\u672A\u505C\u6B62 DSH\u3002");
}
function currentHostManager() {
  if (process.env.PM2_HOME || process.env.NODE_APP_INSTANCE || process.env.KUBERNETES_SERVICE_HOST || process.env.container) throw new Error("\u6B64\u540E\u53F0\u7BA1\u7406\u65B9\u5F0F\u5C1A\u4E0D\u652F\u6301\u81EA\u52A8\u91CD\u542F\u3002");
  if (process.platform === "linux") {
    const group = fs.readFileSync("/proc/self/cgroup", "utf8");
    const units = group.split(/[\n/]/).filter((s) => serviceName(s) && s.endsWith(".service"));
    const unit = units.at(-1);
    if (unit && !/^user@\d+\.service$/.test(unit)) {
      const pid = Number(run("systemctl", ["--user", "show", unit, "--property=MainPID", "--value"]));
      if (pid !== process.pid) throw new Error("DSH \u4E0D\u662F\u8BE5\u670D\u52A1\u7684\u72EC\u7ACB\u4E3B\u8FDB\u7A0B\uFF0C\u672A\u505C\u6B62\u540E\u53F0\u670D\u52A1\u3002");
      return { kind: "systemd", unit };
    }
    if (process.env.INVOCATION_ID) throw new Error("\u65E0\u6CD5\u786E\u8BA4 systemd \u670D\u52A1\u5F52\u5C5E\uFF0C\u672A\u505C\u6B62 DSH\u3002");
  }
  if (process.platform === "darwin") {
    const rows = run("/bin/launchctl", ["list"]).split("\n");
    const row = rows.map((s) => s.trim().split(/\s+/)).find((parts) => parts[0] === String(process.pid));
    if (row) {
      const label = row[2], domain = `gui/${process.getuid?.()}`;
      if (!serviceName(label)) throw new Error("\u540E\u53F0\u4EFB\u52A1\u540D\u79F0\u65E0\u6548\u3002");
      const printed = run("/bin/launchctl", ["print", `${domain}/${label}`]);
      const plist = /^\s*path = (.+\.plist)\s*$/m.exec(printed)?.[1];
      if (!plist) throw new Error("\u540E\u53F0\u4EFB\u52A1\u7F3A\u5C11\u53EF\u6062\u590D\u7684\u542F\u52A8\u914D\u7F6E\u3002");
      const result = { kind: "launchd", label, domain, plist };
      validateManager(result);
      return result;
    }
    if (process.env.LAUNCH_JOBKEY_LABEL) throw new Error("\u65E0\u6CD5\u786E\u8BA4 launchd \u670D\u52A1\u5F52\u5C5E\uFF0C\u672A\u505C\u6B62 DSH\u3002");
  }
  return { kind: "process" };
}
function startUpdateWorker(manager, directory, executable) {
  validateManager(manager);
  const id = path6.basename(directory);
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("\u65E0\u6548\u7684\u66F4\u65B0\u4EFB\u52A1");
  const args = [path6.join(directory, "update-worker.js"), path6.join(directory, "job.json")];
  if (manager.kind === "systemd") {
    run("systemd-run", ["--user", "--quiet", "--collect", `--unit=dsh-wechat-update-${id}`, "--property=Type=exec", `--working-directory=${directory}`, executable, ...args]);
  } else if (manager.kind === "launchd") {
    run("/bin/launchctl", ["submit", "-l", `dsh.wechat.update.${id}`, "-o", path6.join(directory, "worker.log"), "-e", path6.join(directory, "worker.log"), "--", executable, ...args]);
  } else {
    const log = fs.openSync(path6.join(directory, "worker.log"), "a", 384);
    const child = spawn(executable, args, { cwd: directory, env: process.env, windowsHide: true, detached: true, stdio: ["ignore", log, log] });
    fs.closeSync(log);
    child.unref();
    child.on("error", () => {
    });
    if (!child.pid) throw new Error("\u65E0\u6CD5\u542F\u52A8\u66F4\u65B0\u8FDB\u7A0B");
  }
}

// src/install-capabilities.ts
function assertNativeUpdateCapabilities(context) {
  const ctx = context.root || context;
  const web = ctx.get("webServer");
  const sessions = ctx.get("sessions");
  const missing = [];
  for (const name of ["on", "listeners", "removeAllListeners", "removeListener"]) {
    if (typeof web?.server?.[name] !== "function") missing.push("webServer." + name);
  }
  for (const name of ["get", "list", "flush"]) {
    if (typeof sessions?.[name] !== "function") missing.push("sessions." + name);
  }
  if (typeof ctx.fiber?.dispose !== "function") missing.push("lifecycle.dispose");
  if (missing.length) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u7F3A\u5C11\u5B89\u5168\u66F4\u65B0\u6240\u9700\u80FD\u529B\uFF0C\u672A\u505C\u6B62\u8282\u70B9\uFF1A" + missing.join(", "));
}

// src/install-profile.ts
import fs2 from "node:fs";
import path7 from "node:path";
var PLUGIN_PACKAGE = "@harness-remote/dsh-wechat-remote";
var NATIVE_PLUGIN_PACKAGE = "dsh-wechat-remote";
var ProfileOwnershipError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ProfileOwnershipError";
  }
};
function assertCliInstallOwner(profile, activeRoot) {
  if (path7.basename(profile).toLowerCase() === "desktop") {
    throw new ProfileOwnershipError("Desktop \u7531\u684C\u9762\u5E94\u7528\u7BA1\u7406\uFF0C\u8BF7\u5728\u5176\u63D2\u4EF6\u7BA1\u7406\u9875\u5B89\u88C5\u6216\u66F4\u65B0\uFF1B\u6B64\u547D\u4EE4\u4E0D\u4F1A\u66F4\u65B0 Desktop\u3002");
  }
  let manifest;
  try {
    manifest = JSON.parse(fs2.readFileSync(path7.join(profile, "package.json"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && !activeRoot) return;
    throw new ProfileOwnershipError("\u65E0\u6CD5\u8BFB\u53D6\u5F53\u524D DSH \u914D\u7F6E\u7684\u5B89\u88C5\u5F52\u5C5E\uFF0C\u672A\u66FF\u6362\u63D2\u4EF6\u3002");
  }
  const object2 = (value) => value && typeof value === "object" && !Array.isArray(value);
  if (!object2(manifest) || manifest.dependencies !== void 0 && !object2(manifest.dependencies) || manifest.dsh !== void 0 && !object2(manifest.dsh) || manifest.dsh?.profile !== void 0 && !object2(manifest.dsh.profile)) {
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
      matches = fs2.realpathSync(activeRoot) === fs2.realpathSync(path7.join(profile, "node_modules", PLUGIN_PACKAGE));
    } catch {
    }
    if (!referenced(PLUGIN_PACKAGE) || !matches) {
      throw new ProfileOwnershipError("\u8FD0\u884C\u4E2D\u7684\u63D2\u4EF6\u4E0E\u5F53\u524D\u914D\u7F6E\u767B\u8BB0\u7684\u5B89\u88C5\u6765\u6E90\u4E0D\u4E00\u81F4\uFF0C\u672A\u66FF\u6362\u63D2\u4EF6\u3002");
    }
  }
}

// src/install-control.ts
async function nativeInstallSessions(ctx, signal) {
  const controller = ctx.get("sessionController");
  if (typeof controller?.list !== "function") throw new Error("DSH \u539F\u751F\u4F1A\u8BDD\u68C0\u67E5\u4E0D\u53EF\u7528\uFF0C\u672A\u505C\u6B62\u8282\u70B9\u3002");
  signal.throwIfAborted();
  const value = await controller.list({}, signal);
  signal.throwIfAborted();
  if (!Array.isArray(value?.items) || value.items.some((s) => typeof s.sessionId !== "string" || !s.sessionId || typeof s.running !== "boolean") || new Set(value.items.map((s) => s.sessionId)).size !== value.items.length) {
    throw new Error("DSH \u539F\u751F\u4F1A\u8BDD\u72B6\u6001\u4E0D\u5B8C\u6574\uFF0C\u672A\u505C\u6B62\u8282\u70B9\u3002");
  }
  return value;
}
async function quiesceNativeHost(ctx, read, disposing) {
  const items = (await read("session.list")).items;
  if (!Array.isArray(items) || items.some((s) => s.running !== false)) throw new Error("\u8BF7\u7B49\u5F85\u8FD0\u884C\u4E2D\u7684\u4F1A\u8BDD\u7ED3\u675F\u540E\u518D\u66F4\u65B0\u3002");
  const sessions = ctx.get("sessions");
  if (!sessions?.list || !sessions.flush) throw new Error("\u5F53\u524D DSH \u4E0D\u652F\u6301\u4FDD\u5B58\u68C0\u67E5\u3002");
  for (const session of sessions.list()) if (!await sessions.flush(session)) throw new Error("\u4F1A\u8BDD\u4FDD\u5B58\u672A\u5B8C\u6210\u3002");
  if ((await read("session.list")).items.some((s) => s.running !== false)) throw new Error("\u6709\u65B0\u4F1A\u8BDD\u5F00\u59CB\u8FD0\u884C\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
  disposing();
  await ctx.fiber.dispose();
}
async function createInstallControl(context, config) {
  const ctx = context.root;
  if (desktopOwnsLifecycle(ctx)) throw new Error("\u8BF7\u901A\u8FC7 DSH \u684C\u9762\u5E94\u7528\u7684\u63D2\u4EF6\u7BA1\u7406\u9875\u66F4\u65B0\uFF0C\u672A\u505C\u6B62\u8282\u70B9\u3002");
  assertNativeUpdateCapabilities(ctx);
  const home = agentDshHome(ctx), id = path8.basename(config.directory);
  if (!/^[a-f0-9]{32}$/.test(id) || !/^[a-f0-9]{48}$/.test(config.token) || path8.dirname(config.directory) !== path8.join(home, "harness-remote-updates") || fs3.realpathSync(config.directory) !== config.directory) throw new Error("\u5B89\u88C5\u63A7\u5236\u8BF7\u6C42\u4E0D\u5C5E\u4E8E\u5F53\u524D DSH\u3002");
  const scope = agentProfileScope(ctx), profile = path8.join(home, "profiles", scope);
  assertCliInstallOwner(profile);
  const cli = fs3.realpathSync(process.argv[1]);
  const manifest = JSON.parse(fs3.readFileSync(path8.resolve(cli, "../../package.json"), "utf8"));
  if (manifest.name !== "@deepseek-ai/dsh" || process.execArgv.length) throw new Error("\u6B64 DSH \u542F\u52A8\u65B9\u5F0F\u5C1A\u4E0D\u652F\u6301\u81EA\u52A8\u66F4\u65B0\u3002");
  const manager = currentHostManager(), webPort = resolveDshWebRuntime(ctx, process.env).port;
  const ports = deriveGatePorts(scope, loadAgentDescriptor(ctx).agentInstanceId);
  const nativeExit = ctx.get("appExit");
  const gateway = resolveTypertGateway(ctx);
  let launched = false, quiesced = false;
  const read = async (method, payload = {}) => {
    if (!["session.list", "session.history"].includes(method)) throw new Error("\u4E0D\u652F\u6301\u7684\u5B89\u88C5\u68C0\u67E5");
    if (method === "session.list" && typeof ctx.get("sessionController")?.list === "function") {
      return nativeInstallSessions(ctx, AbortSignal.timeout(1e4));
    }
    const request = { type: "client-request", rpcId: "installer-read", method, payload };
    const response = gateway ? await invokeLegacyRpc(gateway, request, { signal: AbortSignal.timeout(1e4), describeHost: () => ({}) }) : await (await fetch(`http://127.0.0.1:${webPort}/api/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(1e4), redirect: "error" })).json();
    if (!response.result?.ok) throw new Error("\u65E0\u6CD5\u9A8C\u8BC1 DSH \u4F1A\u8BDD\u72B6\u6001\uFF0C\u672A\u505C\u6B62\u8282\u70B9\u3002");
    return response.result.value;
  };
  const version = () => {
    try {
      return JSON.parse(fs3.readFileSync(path8.join(profile, "node_modules/@harness-remote/dsh-wechat-remote/package.json"), "utf8")).version;
    } catch {
      return "0.0.0";
    }
  };
  const server = http.createServer(async (req, res) => {
    const json = (status, value) => {
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(value));
    };
    if (!["127.0.0.1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress || "") || req.headers.host !== `127.0.0.1:${server.address().port}` || req.headers["x-forwarded-for"] || req.headers.authorization !== `Bearer ${config.token}` || req.method !== "POST") return json(403, {});
    if (!launched) timer.refresh();
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
        if (body.length > 4096) throw new Error("\u8BF7\u6C42\u8FC7\u5927");
      }
      const input = body ? JSON.parse(body) : {};
      if (req.url === "/describe") return json(200, {
        pid: process.pid,
        cli,
        executable: process.execPath,
        argv: process.argv.slice(1),
        execArgv: process.execArgv,
        cwd: process.cwd(),
        home,
        profile,
        webPort,
        ...installedNodeStatePaths(home, scope),
        gatePort: ports.publicPort,
        localPort: ports.localPort,
        manager,
        dshVersion: manifest.version,
        pluginVersion: version(),
        platform: process.platform,
        arch: process.arch,
        quiesced
      });
      if (req.url === "/read" && !quiesced) return json(200, await read(input.method, input.payload));
      if (req.url === "/health" && !quiesced) {
        if (!gateway) throw new Error("DSH \u4E1A\u52A1\u63A5\u53E3\u5C1A\u672A\u5C31\u7EEA");
        await gateway.invoke({ namespace: "session", method: "list", args: { _request: {} }, signal: AbortSignal.timeout(1e4) });
        return json(200, { ready: true });
      }
      if (req.url === "/launch" && !launched && !quiesced) {
        assertCliInstallOwner(profile);
        const filename = path8.join(config.directory, "job.json");
        const job = JSON.parse(fs3.readFileSync(filename, "utf8"));
        if (job.id !== id || job.controlOrigin !== origin || job.statusToken !== config.token || job.parentPid !== process.pid || job.home !== home || job.profile !== profile || job.cli !== cli || job.pnpm !== config.pnpm) throw new Error("\u5B89\u88C5\u76EE\u6807\u53D1\u751F\u53D8\u5316");
        startUpdateWorker(manager, config.directory, process.execPath);
        launched = true;
        return json(200, { started: true });
      }
      if (req.url === "/quiesce" && launched && !quiesced) {
        assertCliInstallOwner(profile);
        await quiesceNativeHost(ctx, read, () => {
          quiesced = true;
        });
        return json(200, { quiesced: true, pid: process.pid });
      }
      if (req.url === "/shutdown" && quiesced) {
        json(200, { stopping: true });
        setTimeout(() => {
          close();
          if (nativeExit) nativeExit(0);
          else process.exit(0);
        }, 50);
        return;
      }
      if (req.url === "/close" && !quiesced) {
        json(200, { closed: true });
        close();
        return;
      }
      json(409, { error: "\u5B89\u88C5\u72B6\u6001\u4E0D\u5141\u8BB8\u6B64\u64CD\u4F5C" });
    } catch (error) {
      json(409, { error: error instanceof Error ? error.message : "\u5B89\u88C5\u63A7\u5236\u5931\u8D25" });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const timer = setTimeout(() => {
    if (!launched) close();
  }, 12e4);
  timer.unref();
  function close() {
    clearTimeout(timer);
    server.closeAllConnections();
    server.close();
  }
  writePrivateJsonAtomic(path8.join(config.directory, "control-ready.json"), { origin, pid: process.pid });
  return { origin, close };
}
var apply = async (ctx, config) => {
  await createInstallControl(ctx, config);
};
var inject = ["webServer", "sessions", "appExit"];
export {
  apply,
  createInstallControl,
  inject,
  nativeInstallSessions,
  quiesceNativeHost
};
