/* Generated from the shared plugin installation sources. */

// src/update-download.ts
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

// src/update-policy.ts
var versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;
function validVersion(value) {
  if (typeof value !== "string" || value.length > 80) return false;
  const match = versionPattern.exec(value);
  return Boolean(match && !(match[4] || "").split(".").some((p) => /^0\d+$/.test(p)) && (!value.includes("+") || /^[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*$/.test(value.split("+")[1])));
}
function trustedReleaseAsset(asset, version) {
  if (!asset || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > 32 * 1024 * 1024) return false;
  try {
    const u = new URL(asset.url);
    return u.origin === "https://github.com" && !u.username && !u.password && !u.search && !u.hash && u.pathname.startsWith(`/martinbear1/dsh-wechat-remote/releases/download/v${version}/`) && /^[-A-Za-z0-9_.]+\.tgz$/.test(u.pathname.slice(`/martinbear1/dsh-wechat-remote/releases/download/v${version}/`.length));
  } catch {
    return false;
  }
}
function trustedNpmInstaller(source) {
  if (!source || !validVersion(source.version) || !/^[a-f0-9]{64}$/.test(source.sha256) || !Number.isSafeInteger(source.bytes) || source.bytes < 1 || source.bytes > 32 * 1024 * 1024) return false;
  return source.url === `https://registry.npmjs.org/dsh-wechat-remote/-/dsh-wechat-remote-${source.version}.tgz`;
}

// src/update-download.ts
var DownloadUnavailableError = class extends Error {
  constructor(message = "\u66F4\u65B0\u5305\u6682\u65F6\u65E0\u6CD5\u4E0B\u8F7D\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\uFF1B\u5F53\u524D\u63D2\u4EF6\u5C1A\u672A\u66FF\u6362", options) {
    super(message, options);
    this.name = "DownloadUnavailableError";
  }
};
var githubHosts = ["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"];
async function fetchBytes(url, maxBytes, fetcher, hosts, deadline, options) {
  let next = url;
  for (let i = 0; i < 5; i++) {
    options.signal?.throwIfAborted();
    const u = new URL(next);
    if (u.protocol !== "https:" || u.username || u.password || u.port || !hosts.includes(u.hostname)) throw new Error("\u66F4\u65B0\u4E0B\u8F7D\u6765\u6E90\u4E0D\u53D7\u4FE1\u4EFB");
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new DownloadUnavailableError();
    const controller = new AbortController();
    const cancel = () => controller.abort(options.signal.reason);
    options.signal?.addEventListener("abort", cancel, { once: true });
    const totalTimer = setTimeout(() => controller.abort(new Error("\u66F4\u65B0\u4E0B\u8F7D\u8D85\u65F6")), remaining);
    let activityTimer = setTimeout(() => controller.abort(new Error("\u66F4\u65B0\u6765\u6E90\u54CD\u5E94\u8D85\u65F6")), Math.min(remaining, options.responseTimeoutMs ?? 1e4));
    let reader;
    try {
      let res;
      try {
        res = await fetcher(next, { signal: controller.signal, redirect: "manual" });
      } catch (cause) {
        options.signal?.throwIfAborted();
        throw new DownloadUnavailableError(void 0, { cause });
      } finally {
        clearTimeout(activityTimer);
      }
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        await res.body?.cancel();
        const location = res.headers.get("location");
        if (!location) throw new Error("\u66F4\u65B0\u6765\u6E90\u91CD\u5B9A\u5411\u65E0\u6548");
        next = new URL(location, next).href;
        continue;
      }
      if (!res.ok || !res.body) {
        await res.body?.cancel();
        throw new DownloadUnavailableError();
      }
      if (Number(res.headers.get("content-length")) > maxBytes) {
        await res.body.cancel();
        throw new Error("\u66F4\u65B0\u54CD\u5E94\u8D85\u8FC7\u5927\u5C0F\u9650\u5236");
      }
      reader = res.body.getReader();
      activityTimer = setTimeout(() => controller.abort(new Error("\u66F4\u65B0\u4E0B\u8F7D\u957F\u65F6\u95F4\u6CA1\u6709\u8FDB\u5C55")), options.idleTimeoutMs ?? 15e3);
      const chunks = [];
      let size = 0;
      for (; ; ) {
        let part;
        try {
          part = await reader.read();
        } catch (cause) {
          options.signal?.throwIfAborted();
          throw new DownloadUnavailableError(void 0, { cause });
        }
        const { done, value } = part;
        if (done) break;
        size += value.length;
        if (size > maxBytes) throw new Error("\u66F4\u65B0\u54CD\u5E94\u8D85\u8FC7\u5927\u5C0F\u9650\u5236");
        chunks.push(value);
        if (value.length) activityTimer.refresh();
      }
      options.signal?.throwIfAborted();
      return Buffer.concat(chunks);
    } catch (error) {
      try {
        await reader?.cancel();
      } catch {
      }
      throw error;
    } finally {
      clearTimeout(totalTimer);
      clearTimeout(activityTimer);
      options.signal?.removeEventListener("abort", cancel);
      reader?.releaseLock();
    }
  }
  throw new Error("\u66F4\u65B0\u6765\u6E90\u91CD\u5B9A\u5411\u8FC7\u591A");
}
async function boundedFetch(url, maxBytes, fetcher = fetch) {
  return fetchBytes(
    url,
    maxBytes,
    fetcher,
    [...githubHosts, "relay.xyxfood.xyz"],
    Date.now() + (maxBytes <= 256 * 1024 ? 1e4 : 6e4),
    {}
  );
}
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
function pluginFromInstaller(archive, release) {
  if (!trustedNpmInstaller(release.npmInstaller)) throw new Error("\u5907\u7528\u5B89\u88C5\u5305\u6765\u6E90\u4E0D\u53D7\u4FE1\u4EFB");
  verifyBytes(archive, release.npmInstaller);
  let manifest, plugin;
  visitArchive(archive, (name, data) => {
    if (name === "package/package.json") manifest = readManifest(data);
    if (name === "package/assets/plugin.tgz") {
      if (data.length !== release.asset?.bytes) throw new Error("\u5185\u7F6E\u63D2\u4EF6\u5927\u5C0F\u4E0D\u5339\u914D");
      plugin = Buffer.from(data);
    }
  });
  if (!manifest || manifest.name !== "dsh-wechat-remote" || manifest.version !== release.npmInstaller.version || !plugin) throw new Error("\u5907\u7528\u5B89\u88C5\u5305\u540D\u79F0\u3001\u7248\u672C\u6216\u5185\u7F6E\u63D2\u4EF6\u4E0D\u5339\u914D");
  auditArchive(plugin, release);
  return plugin;
}
async function downloadNpmRelease(release, fetcher = fetch, options = {}) {
  if (!trustedReleaseAsset(release.asset, release.version) || !trustedNpmInstaller(release.npmInstaller)) throw new Error("\u5907\u7528\u5B89\u88C5\u5305\u6765\u6E90\u4E0D\u53D7\u4FE1\u4EFB");
  const source = release.npmInstaller;
  const body = await fetchBytes(source.url, source.bytes, fetcher, ["registry.npmjs.org"], Date.now() + (options.timeoutMs ?? 6e4), options);
  options.signal?.throwIfAborted();
  return pluginFromInstaller(body, release);
}
async function downloadRelease(release, fetcher = fetch, options = {}) {
  if (!trustedReleaseAsset(release.asset, release.version)) throw new Error("\u6682\u65E0\u53EF\u9A8C\u8BC1\u7684\u6B63\u5F0F\u66F4\u65B0\u5305");
  if (release.npmInstaller !== void 0 && !trustedNpmInstaller(release.npmInstaller)) throw new Error("\u5907\u7528\u5B89\u88C5\u5305\u6765\u6E90\u4E0D\u53D7\u4FE1\u4EFB");
  const deadline = Date.now() + (options.timeoutMs ?? 12e4);
  let body;
  try {
    body = await fetchBytes(
      release.asset.url,
      release.asset.bytes,
      fetcher,
      githubHosts,
      Math.min(deadline, Date.now() + 6e4),
      options
    );
  } catch (error) {
    options.signal?.throwIfAborted();
    if (!(error instanceof DownloadUnavailableError) || !release.npmInstaller) throw error;
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw error;
    return downloadNpmRelease(release, fetcher, { ...options, timeoutMs: Math.min(remaining, 6e4) });
  }
  auditArchive(body, release);
  return body;
}
export {
  DownloadUnavailableError,
  auditArchive,
  boundedFetch,
  downloadNpmRelease,
  downloadRelease,
  pluginFromInstaller
};
