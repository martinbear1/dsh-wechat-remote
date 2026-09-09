/* Generated from the shared plugin installation sources. */

// src/update-download.ts
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

// src/update-policy.ts
function trustedReleaseAsset(asset, version) {
  if (!asset || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > 32 * 1024 * 1024) return false;
  try {
    const u = new URL(asset.url);
    return u.origin === "https://github.com" && !u.username && !u.password && !u.search && !u.hash && u.pathname.startsWith(`/martinbear1/dsh-wechat-remote/releases/download/v${version}/`) && /^[-A-Za-z0-9_.]+\.tgz$/.test(u.pathname.slice(`/martinbear1/dsh-wechat-remote/releases/download/v${version}/`.length));
  } catch {
    return false;
  }
}

// src/update-download.ts
async function boundedFetch(url, maxBytes, fetcher = fetch) {
  let next = url;
  for (let i = 0; i < 5; i++) {
    const u = new URL(next);
    if (u.protocol !== "https:" || u.username || u.password || u.port || !["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com", "relay.xyxfood.xyz"].includes(u.hostname)) throw new Error("\u66F4\u65B0\u4E0B\u8F7D\u6765\u6E90\u4E0D\u53D7\u4FE1\u4EFB");
    const res = await fetcher(next, { signal: AbortSignal.timeout(maxBytes <= 256 * 1024 ? 1e4 : 6e4), redirect: "manual" });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      await res.body?.cancel();
      const location = res.headers.get("location");
      if (!location) throw new Error("\u66F4\u65B0\u6765\u6E90\u91CD\u5B9A\u5411\u65E0\u6548");
      next = new URL(location, next).href;
      continue;
    }
    if (!res.ok || !res.body) {
      await res.body?.cancel();
      throw new Error("\u66F4\u65B0\u670D\u52A1\u6682\u4E0D\u53EF\u7528");
    }
    if (Number(res.headers.get("content-length")) > maxBytes) {
      await res.body.cancel();
      throw new Error("\u66F4\u65B0\u54CD\u5E94\u8D85\u8FC7\u5927\u5C0F\u9650\u5236");
    }
    const reader = res.body.getReader(), chunks = [];
    let size = 0;
    try {
      for (; ; ) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) throw new Error("\u66F4\u65B0\u54CD\u5E94\u8D85\u8FC7\u5927\u5C0F\u9650\u5236");
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel();
      throw error;
    }
    return Buffer.concat(chunks);
  }
  throw new Error("\u66F4\u65B0\u6765\u6E90\u91CD\u5B9A\u5411\u8FC7\u591A");
}
function auditArchive(archive, release) {
  if (!release.asset || archive.length !== release.asset.bytes || createHash("sha256").update(archive).digest("hex") !== release.asset.sha256) throw new Error("\u66F4\u65B0\u5305\u6821\u9A8C\u5931\u8D25\uFF0C\u672A\u4FEE\u6539\u5F53\u524D\u63D2\u4EF6");
  const tar = gunzipSync(archive, { maxOutputLength: 64 * 1024 * 1024 });
  const seen = /* @__PURE__ */ new Set();
  let manifest, entries = 0;
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
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
    if (!name.startsWith("package/") || /[\\:\x00-\x1f]/.test(name) || name.split("/").some((part) => part === ".." || part === ".") || name.split("/").some((part) => /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) || !["0", "", "5"].includes(type) || seen.has(name.toLowerCase()) || !Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length) throw new Error("\u66F4\u65B0\u5305\u5305\u542B\u4E0D\u5B89\u5168\u7684\u8DEF\u5F84\u6216\u6587\u4EF6\u7C7B\u578B");
    seen.add(name.toLowerCase());
    if (name === "package/package.json") {
      if (size > 65536) throw new Error("\u66F4\u65B0\u5305\u6E05\u5355\u8FC7\u5927");
      manifest = JSON.parse(tar.subarray(offset + 512, offset + 512 + size).toString("utf8"));
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!manifest || manifest.name !== "@harness-remote/dsh-wechat-remote" || manifest.version !== release.version || !seen.has("package/lib/index.js") || !seen.has("package/lib/client.js")) throw new Error("\u66F4\u65B0\u5305\u540D\u79F0\u3001\u7248\u672C\u6216\u5165\u53E3\u4E0D\u5339\u914D");
  const scripts = manifest.scripts;
  if (["preinstall", "install", "postinstall", "prepare"].some((name) => scripts?.[name])) throw new Error("\u66F4\u65B0\u5305\u5305\u542B\u4E0D\u5141\u8BB8\u7684\u5B89\u88C5\u811A\u672C");
}
async function downloadRelease(release, fetcher = fetch) {
  if (!trustedReleaseAsset(release.asset, release.version)) throw new Error("\u6682\u65E0\u53EF\u9A8C\u8BC1\u7684\u6B63\u5F0F\u66F4\u65B0\u5305");
  const body = await boundedFetch(release.asset.url, release.asset.bytes, fetcher);
  auditArchive(body, release);
  return body;
}
export {
  auditArchive,
  boundedFetch,
  downloadRelease
};
