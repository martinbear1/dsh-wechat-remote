/* Generated from the shared plugin installation sources. */

// src/install-archive.ts
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash as createHash2, randomBytes } from "node:crypto";

// src/update-download.ts
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
var artifactSourceTimeoutMs = 10 * 60 * 1e3;
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
    throw new Error("\u539F\u751F\u5B89\u88C5\u5305\u7ED3\u6784\u6216\u7248\u672C\u4E0D\u5339\u914D");
  }
  const release = metadata.catalog?.releases?.find((row) => row.version === version);
  if (!release) throw new Error("\u539F\u751F\u5B89\u88C5\u5305\u7F3A\u5C11\u5185\u7F6E\u7248\u672C\u4FE1\u606F");
  auditArchive(plugin, release);
}

// src/install-archive.ts
function checkedNativeSource(source, version) {
  if (!path.isAbsolute(source) || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) throw new Error("\u5B89\u88C5\u6765\u6E90\u65E0\u6548");
  const actual = fs.realpathSync(source);
  const read = (name) => JSON.parse(fs.readFileSync(path.join(actual, name), "utf8"));
  const manifest = read("package.json");
  if (manifest.name !== "dsh-wechat-remote" || manifest.version !== version || manifest.dsh?.bundle?.patch !== "./cordis.patch.yml" || ["preinstall", "install", "postinstall", "prepare", "prepack", "postpack"].some((key) => manifest.scripts?.[key])) throw new Error("\u5B89\u88C5\u5305\u4E0E\u76EE\u6807\u7248\u672C\u4E0D\u4E00\u81F4");
  const metadata = read("assets/release.json");
  const release = metadata.catalog?.releases?.find((row) => row.version === version);
  const bytes = fs.readFileSync(path.join(actual, "assets/plugin.tgz"));
  if (!release || metadata.version !== version || release.asset?.bytes !== bytes.length || createHash2("sha256").update(bytes).digest("hex") !== release.asset.sha256) throw new Error("\u5B89\u88C5\u5305\u6821\u9A8C\u5931\u8D25");
  return actual;
}
async function packNativeArchive(source, version, directory) {
  const actual = checkedNativeSource(source, version);
  const pnpm = path.join(actual, "node_modules/pnpm/bin/pnpm.cjs");
  if (!fs.existsSync(pnpm)) throw new Error("\u5B89\u88C5\u5305\u7F3A\u5C11\u5185\u7F6E\u6253\u5305\u5DE5\u5177\uFF0C\u672A\u4F7F\u7528\u5168\u5C40\u5DE5\u5177\u66FF\u4EE3");
  fs.mkdirSync(directory, { recursive: true, mode: 448 });
  const temporary = path.join(directory, `packing-${randomBytes(16).toString("hex")}.tgz`);
  try {
    await promisify(execFile)(process.execPath, [pnpm, "--config.ignore-scripts=true", "--config.node-linker=hoisted", "pack", "--out", temporary], {
      cwd: actual,
      windowsHide: true,
      timeout: 6e4,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
    });
    checkedNativeSource(actual, version);
    if (fs.statSync(temporary).size > 32 * 1024 * 1024) throw new Error("\u5B89\u88C5\u5305\u8D85\u8FC7\u5B89\u5168\u5927\u5C0F\u9650\u5236");
    const bytes = fs.readFileSync(temporary);
    auditNativeArchive(bytes, version);
    const digest = createHash2("sha256").update(bytes).digest("hex");
    const archive = path.join(directory, `${digest}.tgz`);
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
export {
  checkedNativeSource,
  packNativeArchive
};
