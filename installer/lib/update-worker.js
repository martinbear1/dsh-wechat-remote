/* Generated from the shared plugin installation sources. */

// src/update-worker.ts
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

// src/install-capabilities.ts
var LEGACY_UPDATE_MANUAL_MESSAGE = "\u6B64\u5B89\u88C5\u7531 DSH Web \u547D\u4EE4\u884C\u7BA1\u7406\uFF0C\u4E0D\u652F\u6301\u4E00\u952E\u5728\u7EBF\u66F4\u65B0\u3002\u8BF7\u5148\u901A\u8FC7\u539F\u542F\u52A8\u65B9\u5F0F\u6B63\u5E38\u505C\u6B62 Web\uFF08\u540E\u53F0\u670D\u52A1\u9700\u6682\u505C\u81EA\u52A8\u91CD\u542F\uFF09\uFF0C\u518D\u6267\u884C\u539F\u5B89\u88C5\u547D\u4EE4\uFF1B\u539F\u751F\u5B89\u88C5\u5305\u8BF7\u4F7F\u7528 DSH \u63D2\u4EF6\u7BA1\u7406\u9875\u3002\u672A\u505C\u6B62\u6216\u4FEE\u6539\u5F53\u524D\u8282\u70B9\u3002";
function legacyUpdateError() {
  return Object.assign(new Error(LEGACY_UPDATE_MANUAL_MESSAGE), { code: "NATIVE_MANUAL_UPDATE_REQUIRED" });
}

// src/update-worker.ts
function releaseOwnedUpdateLock(lock, id) {
  try {
    if (fs.readFileSync(lock, "utf8") === id) fs.unlinkSync(lock);
  } catch {
  }
}
var hashFile = (f) => createHash("sha256").update(fs.readFileSync(f)).digest("hex");
function durableSnapshot(job) {
  const result = {};
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name);
      if (path.relative(job.home, file).split(path.sep).includes("harness-remote") && (["installation-offers", ".storage-lock", "storage-layout.json", "storage-transaction.json", "gate-wechat-state.json"].includes(e.name) || /^\.storage-lock-pending-\d+-[a-f0-9]{32}$/.test(e.name))) continue;
      if (e.isSymbolicLink()) result[path.relative(job.home, file)] = createHash("sha256").update(fs.readlinkSync(file)).digest("hex");
      else if (e.isDirectory()) walk(file);
      else if (e.isFile()) result[path.relative(job.home, file)] = hashFile(file);
    }
  };
  walk(path.join(job.home, "sessions"));
  walk(path.join(job.home, "attachments"));
  walk(path.join(job.home, "harness-remote"));
  for (const e of fs.readdirSync(job.home, { withFileTypes: true })) {
    if (e.isFile() && /(?:identity|settings|credentials|public|gate-wechat)/i.test(e.name) && !e.name.endsWith(".log")) {
      const f = path.join(job.home, e.name);
      if (e.name === "gate-wechat-state.json" || f === job.stateFile) continue;
      result[e.name] = hashFile(f);
    }
  }
  if (fs.existsSync(job.stateFile)) {
    const state = JSON.parse(fs.readFileSync(job.stateFile, "utf8"));
    result["$binding"] = createHash("sha256").update(JSON.stringify([state.token, state.publicIdentityNodeId])).digest("hex");
  }
  return result;
}
function assertPreserved(before, after) {
  for (const [key, hash] of Object.entries(before)) if (after[key] !== hash) throw new Error("\u5347\u7EA7\u540E\u6570\u636E\u6821\u9A8C\u4E0D\u4E00\u81F4\uFF1B\u505C\u6B62\u81EA\u52A8\u64CD\u4F5C\u5E76\u4FDD\u7559\u5907\u4EFD");
}
async function executeUpdate(_job, _progress, _quiesce) {
  throw legacyUpdateError();
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.error(legacyUpdateError().message);
  process.exitCode = 1;
  if (process.connected) process.disconnect();
}
export {
  assertPreserved,
  durableSnapshot,
  executeUpdate,
  releaseOwnedUpdateLock
};
