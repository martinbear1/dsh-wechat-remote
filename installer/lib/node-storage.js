/* Generated from the shared plugin installation sources. */

// src/node-storage.ts
import { createHash, createPrivateKey, createPublicKey, randomBytes as randomBytes2 } from "node:crypto";
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2, readdirSync, renameSync as renameSync2, rmSync as rmSync2, rmdirSync } from "node:fs";
import path from "node:path";

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
  const value = JSON.parse(readFileSync(file, "utf8"));
  tightenPrivateFile(file);
  return value;
}

// src/node-storage.ts
var names = ["identity.json", "gate-wechat-state.json", "public.json"];
var legacyNames = {
  "identity.json": "harness-remote-public-identity.json",
  "gate-wechat-state.json": "gate-wechat-state.json",
  "public.json": "harness-remote-public.json"
};
var conflict = () => new Error("\u8282\u70B9\u914D\u7F6E\u5B58\u5728\u5E76\u53D1\u4FEE\u6539\u6216\u8FC1\u79FB\u51B2\u7A81\uFF1B\u672A\u8986\u76D6\u914D\u5BF9\u4FE1\u606F\uFF0C\u8BF7\u5173\u95ED\u540C\u4E00 Web \u8282\u70B9\u7684\u5176\u4ED6\u5B9E\u4F8B\u540E\u91CD\u8BD5");
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function hash(value) {
  return value === null ? null : createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
function read(file) {
  try {
    const value = readPrivateJson(file);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw conflict();
    return value;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
function nodeStorageDirectory(home, profile) {
  const scope = ["web", "default"].includes(profile.toLowerCase()) ? "web" : profile;
  const key = createHash("sha256").update(`deepseek-harness\0${scope}`).digest("hex").slice(0, 24);
  return path.join(home, "harness-remote", "instances", key);
}
function installedNodeStatePaths(home, profile) {
  const directory = nodeStorageDirectory(home, profile);
  const legacy = ["web", "default"].includes(profile.toLowerCase()) && !existsSync2(path.join(directory, "storage-layout.json"));
  return {
    stateFile: legacy ? path.join(home, legacyNames["gate-wechat-state.json"]) : path.join(directory, "gate-wechat-state.json"),
    identityFile: legacy ? path.join(home, legacyNames["identity.json"]) : path.join(directory, "identity.json")
  };
}
function validate(values) {
  const identity = values["identity.json"], gate = values["gate-wechat-state.json"];
  if (identity) {
    if (typeof identity.privateKeyPem !== "string" || typeof identity.publicKeyPem !== "string") throw conflict();
    const privateKey = createPrivateKey(identity.privateKeyPem);
    const publicKey = createPublicKey(identity.publicKeyPem);
    if (privateKey.asymmetricKeyType !== "ed25519" || publicKey.asymmetricKeyType !== "ed25519") throw conflict();
    const bytes = publicKey.export({ format: "der", type: "spki" });
    if (!bytes.equals(createPublicKey(privateKey).export({ format: "der", type: "spki" }))) throw conflict();
    if (identity.nodeId !== createHash("sha256").update(bytes).digest().subarray(0, 18).toString("base64url")) throw conflict();
  }
  if (gate && (typeof gate.token !== "string" || gate.token.length < 32)) throw conflict();
  if (gate?.publicIdentityNodeId != null && typeof gate.publicIdentityNodeId !== "string") throw conflict();
}
function files(directory, name) {
  const home = path.resolve(directory, "../../..");
  if (nodeStorageDirectory(home, "web") !== path.normalize(directory)) throw conflict();
  return { current: path.join(directory, name), legacy: path.join(home, legacyNames[name]) };
}
function readPairs(directory) {
  return Object.fromEntries(names.map((name) => {
    const pair = files(directory, name);
    return [name, { current: read(pair.current), legacy: read(pair.legacy) }];
  }));
}
function locked(directory, run) {
  mkdirSync2(directory, { recursive: true, mode: 448 });
  const lock = path.join(directory, ".storage-lock");
  const generation = `${process.pid}-${randomBytes2(16).toString("hex")}`;
  const staging = path.join(directory, `.storage-lock-pending-${generation}`);
  const ownerName = `owner-${generation}.json`;
  let acquired = false;
  mkdirSync2(staging, { mode: 448 });
  try {
    writePrivateJsonAtomic(path.join(staging, ownerName), { pid: process.pid });
    if (existsSync2(lock)) {
      let pid;
      let previousOwner;
      try {
        const entries = readdirSync(lock);
        if (entries.length !== 1 || !/^(owner\.json|owner-\d+-[a-f0-9]{32}\.json)$/.test(entries[0])) throw conflict();
        previousOwner = path.join(lock, entries[0]);
        pid = JSON.parse(readFileSync2(previousOwner, "utf8")).pid;
      } catch {
        throw conflict();
      }
      if (!Number.isSafeInteger(pid) || Number(pid) <= 0) throw conflict();
      try {
        process.kill(Number(pid), 0);
        throw conflict();
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
      try {
        rmSync2(previousOwner);
      } catch {
        throw conflict();
      }
      rmdirSync(lock);
    }
    try {
      renameSync2(staging, lock);
    } catch (error) {
      if (existsSync2(lock)) throw conflict();
      throw error;
    }
    acquired = true;
    return run();
  } finally {
    const ownedDirectory = acquired ? lock : staging;
    const ownerFile = path.join(ownedDirectory, ownerName);
    if (existsSync2(ownerFile)) rmSync2(ownerFile);
    if (existsSync2(ownedDirectory)) rmdirSync(ownedDirectory);
  }
}
function commit(directory, transaction) {
  if (transaction.version !== 1 || !transaction.values || !transaction.before) throw conflict();
  validate(transaction.values);
  const pairs = readPairs(directory);
  for (const name of names) for (const side of ["current", "legacy"]) {
    const actual = hash(pairs[name][side]), next = hash(transaction.values[name]);
    if (actual !== transaction.before[name]?.[side] && actual !== next) throw conflict();
  }
  for (const name of names) {
    const value = transaction.values[name];
    if (value === null) continue;
    const pair = files(directory, name);
    for (const side of ["current", "legacy"]) {
      if (hash(pairs[name][side]) !== hash(value)) writePrivateJsonAtomic(pair[side], value);
    }
  }
  const layout = { version: 1, scope: "web", hashes: Object.fromEntries(names.map((name) => [name, hash(transaction.values[name])])) };
  writePrivateJsonAtomic(path.join(directory, "storage-layout.json"), layout);
  rmSync2(path.join(directory, "storage-transaction.json"));
  return layout;
}
function recover(directory) {
  const journal = path.join(directory, "storage-transaction.json");
  if (existsSync2(journal)) commit(directory, readPrivateJson(journal));
}
function publish(directory, values, pairs) {
  validate(values);
  const transaction = {
    version: 1,
    values,
    before: Object.fromEntries(names.map((name) => [name, { current: hash(pairs[name].current), legacy: hash(pairs[name].legacy) }]))
  };
  writePrivateJsonAtomic(path.join(directory, "storage-transaction.json"), transaction);
  commit(directory, transaction);
}
function layoutAt(directory) {
  const file = path.join(directory, "storage-layout.json");
  if (!existsSync2(file)) return null;
  const value = readPrivateJson(file);
  if (value.version !== 1 || value.scope !== "web" || !value.hashes || names.some((name) => value.hashes[name] !== null && typeof value.hashes[name] !== "string")) throw conflict();
  return value;
}
function prepareNodeStorage(home, profile) {
  if (profile.toLowerCase() === "desktop") return;
  if (!["web", "default"].includes(profile.toLowerCase())) {
    const directory2 = nodeStorageDirectory(home, profile);
    const target = path.join(directory2, "public.json");
    if (!existsSync2(target) && (existsSync2(path.join(directory2, "identity.json")) || existsSync2(path.join(directory2, "gate-wechat-state.json")))) {
      const previous = read(path.join(home, "harness-remote-public.json"));
      if (previous) createPrivateJsonAtomic(target, previous);
    }
    return;
  }
  const directory = nodeStorageDirectory(home, profile);
  locked(directory, () => {
    recover(directory);
    const layout = layoutAt(directory), pairs = readPairs(directory);
    const values = {};
    let changed = !layout;
    for (const name of names) {
      const { current, legacy } = pairs[name], a = hash(current), b = hash(legacy);
      const base = layout?.hashes[name] ?? null;
      if (base !== null && (a === null || b === null)) throw conflict();
      if (a === b) values[name] = current;
      else if (a === base) values[name] = legacy;
      else if (b === base) values[name] = current;
      else throw conflict();
      changed ||= a !== b || a !== base;
    }
    validate(values);
    if (changed) publish(directory, values, pairs);
  });
}
function writeNodeState(file, value) {
  const directory = path.dirname(file), name = path.basename(file);
  if (!names.includes(name) || !existsSync2(path.join(directory, "storage-layout.json"))) {
    writePrivateJsonAtomic(file, value);
    return;
  }
  locked(directory, () => {
    const interrupted = existsSync2(path.join(directory, "storage-transaction.json"));
    recover(directory);
    if (interrupted) throw new Error("\u5DF2\u6062\u590D\u4E2D\u65AD\u7684\u8282\u70B9\u914D\u7F6E\u5199\u5165\uFF0C\u8BF7\u91CD\u542F\u5F53\u524D\u8282\u70B9\u540E\u91CD\u8BD5");
    const layout = layoutAt(directory), pairs = readPairs(directory);
    for (const name2 of names) {
      if (hash(pairs[name2].current) !== layout.hashes[name2] || hash(pairs[name2].legacy) !== layout.hashes[name2]) throw conflict();
    }
    const values = Object.fromEntries(names.map((key) => [key, pairs[key].current]));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw conflict();
    values[name] = value;
    publish(directory, values, pairs);
  });
}
export {
  installedNodeStatePaths,
  nodeStorageDirectory,
  prepareNodeStorage,
  writeNodeState
};
