/* Generated from the shared plugin installation sources. */

// src/update-policy.ts
var UPDATE_SCHEMA = 1;
var RELEASE_REPOSITORY = "https://github.com/martinbear1/dsh-wechat-remote";
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
function trustedReleaseAsset(asset, version) {
  if (!asset || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > 32 * 1024 * 1024) return false;
  try {
    const u = new URL(asset.url);
    return u.origin === "https://github.com" && !u.username && !u.password && !u.search && !u.hash && u.pathname.startsWith(`/martinbear1/dsh-wechat-remote/releases/download/v${version}/`) && /^[-A-Za-z0-9_.]+\.tgz$/.test(u.pathname.slice(`/martinbear1/dsh-wechat-remote/releases/download/v${version}/`.length));
  } catch {
    return false;
  }
}
function validateCatalog(value) {
  const c = value;
  const strings = (v, max = 100) => Array.isArray(v) && v.length <= max && v.every((s) => typeof s === "string" && s.length > 0 && s.length <= 100);
  if (!c || c.schemaVersion !== 1 || typeof c.revision !== "string" || !/^[\w.-]{1,80}$/.test(c.revision) || !Number.isSafeInteger(c.issuedAt) || !Number.isSafeInteger(c.expiresAt) || c.expiresAt <= c.issuedAt || c.expiresAt - c.issuedAt > 32 * 864e5 || !Array.isArray(c.releases) || c.releases.length > 100 || !Array.isArray(c.blocked) || c.blocked.length > 100 || !strings(c.retiredDsh)) throw new Error("Invalid update catalog");
  const versions = /* @__PURE__ */ new Set();
  for (const r of c.releases) {
    if (!r || !validVersion(r.version) || versions.has(r.version) || !["stable", "preview"].includes(r.channel) || r.channel === "stable" && versionPattern.exec(r.version)[4] || !strings(r.dsh) || !r.dsh.length || !r.dsh.every(validVersion) || !strings(r.platforms, 3) || !r.platforms.length || !r.platforms.every((p) => ["windows", "macos", "linux"].includes(p)) || !strings(r.architectures, 32) || !r.architectures.length || !r.architectures.every((a) => /^[a-z0-9_-]{1,32}$/.test(a)) || r.asset && !trustedReleaseAsset(r.asset, r.version)) throw new Error("Invalid release entry");
    versions.add(r.version);
    if (r.targets !== void 0) {
      if (!Array.isArray(r.targets) || !r.targets.length || r.targets.length > 12) throw new Error("Invalid release targets");
      const seen = /* @__PURE__ */ new Set();
      for (const target of r.targets) {
        const key = `${target?.platform}:${target?.arch}`;
        if (!target || !r.platforms.includes(target.platform) || !r.architectures.includes(target.arch) || !strings(target.dsh) || !target.dsh.length || !target.dsh.every((v) => r.dsh.includes(v)) || seen.has(key)) throw new Error("Invalid release target");
        seen.add(key);
      }
    }
  }
  for (const b of c.blocked) if (!b || !validVersion(b.pluginVersion) || typeof b.reason !== "string" || !b.reason || b.reason.length > 240 || b.dsh && !strings(b.dsh) || b.platforms && !strings(b.platforms, 3)) throw new Error("Invalid blocked entry");
  if (!c.retiredDsh.every(validVersion)) throw new Error("Invalid retired DSH");
  if (c.manualUpgradePlugins && (!strings(c.manualUpgradePlugins) || !c.manualUpgradePlugins.every(validVersion))) throw new Error("Invalid manual-upgrade plugins");
  return c;
}
function releaseMatches(r, current) {
  return r.dsh.includes(current.agentVersion) && r.platforms.includes(current.platform) && Boolean(current.arch && r.architectures.includes(current.arch)) && (!r.targets || r.targets.some((t) => t.platform === current.platform && (!current.arch || t.arch === current.arch) && t.dsh.includes(current.agentVersion)));
}
function assessUpdate(raw, current, now = Date.now(), preview = false) {
  const base = {
    schemaVersion: 1,
    revision: "",
    checkedAt: now,
    expiresAt: now,
    severity: "unknown",
    component: "none",
    code: "unavailable",
    label: "\u6682\u65F6\u65E0\u6CD5\u68C0\u67E5\u66F4\u65B0",
    message: "\u517C\u5BB9\u4FE1\u606F\u6682\u4E0D\u53EF\u7528\uFF0C\u4E0D\u5F71\u54CD\u73B0\u6709\u8FDE\u63A5\uFF1B\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
    current
  };
  let c;
  try {
    c = validateCatalog(raw);
  } catch {
    return base;
  }
  base.revision = c.revision;
  base.expiresAt = c.expiresAt;
  if (c.expiresAt <= now || c.issuedAt > now + 3e5) return { ...base, code: "stale", label: "\u68C0\u67E5\u4FE1\u606F\u5DF2\u8FC7\u671F" };
  if (!["dsh", "deepseek-harness"].includes(current.agentKind)) return { ...base, code: "unknown-agent", label: "\u5C1A\u672A\u63D0\u4F9B\u517C\u5BB9\u4FE1\u606F" };
  if (!validVersion(current.agentVersion) || !validVersion(current.pluginVersion) || !["windows", "macos", "linux"].includes(current.platform)) return { ...base, code: "missing-version", label: "\u7248\u672C\u4FE1\u606F\u4E0D\u5B8C\u6574" };
  const blocked = (version) => c.blocked.find((b) => b.pluginVersion === version && (!b.dsh || b.dsh.includes(current.agentVersion)) && (!b.platforms || b.platforms.includes(current.platform)));
  const own = c.releases.find((r) => r.version === current.pluginVersion);
  const compatible = Boolean(current.arch && own && releaseMatches(own, current) && !blocked(own.version));
  if (c.retiredDsh.includes(current.agentVersion)) return {
    ...base,
    severity: "required",
    component: "agent",
    code: "agent-retired",
    label: "\u9700\u8981\u66F4\u65B0 DSH",
    message: "\u6B64 DSH \u7248\u672C\u5DF2\u505C\u6B62\u652F\u6301\u3002\u8BF7\u5728\u4E3B\u673A\u4E0A\u6309\u53D1\u5E03\u8BF4\u660E\u5347\u7EA7 DSH\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u4FEE\u6539 DSH\u3002",
    releaseUrl: `${RELEASE_REPOSITORY}/releases`
  };
  const target = c.releases.filter((r) => (r.channel === "stable" || preview) && !blocked(r.version) && compareVersions(r.version, current.pluginVersion) > 0).sort((a, b) => compareVersions(b.version, a.version))[0];
  const issue = blocked(current.pluginVersion);
  if (target) {
    const manual = c.manualUpgradePlugins?.includes(current.pluginVersion) ? {
      manualUpdate: `\u6B64\u65E7\u63D2\u4EF6\u6CA1\u6709\u68C0\u67E5\u66F4\u65B0\u548C\u4E00\u952E\u66F4\u65B0\u529F\u80FD\u3002\u9996\u6B21\u9700\u5728\u8282\u70B9\u6240\u5728\u7535\u8111\uFF0C\u6309\u76EE\u6807\u7248\u672C ${target.version} \u7684\u53D1\u5E03\u8BF4\u660E\u624B\u5DE5\u5347\u7EA7\u63D2\u4EF6\uFF0C\u5E76\u4F7F\u7528\u539F\u6765\u7684 DSH_HOME \u548C profile \u91CD\u542F\u3002\u4E0D\u8981\u5220\u9664\u8282\u70B9\u6216\u91CD\u65B0\u914D\u5BF9\uFF1B\u5347\u7EA7\u540E\u624D\u53EF\u4F7F\u7528\u4E00\u952E\u66F4\u65B0\u3002`
    } : {};
    const required = Boolean(issue);
    return {
      ...base,
      ...manual,
      severity: required ? "required" : compatible ? "info" : "recommended",
      component: "plugin",
      code: required ? "plugin-required" : "plugin-available",
      label: required ? "\u5FC5\u987B\u66F4\u65B0\u63D2\u4EF6" : "\u63D2\u4EF6\u53EF\u66F4\u65B0",
      message: (issue ? issue.reason + "\u3002" : "") + `\u53EF\u66F4\u65B0\u81F3\u63D2\u4EF6 ${target.version}\uFF1B\u66F4\u65B0\u524D\u4F1A\u68C0\u67E5\u5F53\u524D\u4E3B\u673A\u7684\u5B89\u88C5\u4E0E\u91CD\u542F\u6761\u4EF6\uFF0C\u4E0D\u4F1A\u66F4\u6362 DSH \u672C\u4F53\u3002`,
      targetVersion: target.version,
      releaseUrl: `${RELEASE_REPOSITORY}/releases/tag/v${target.version}`
    };
  }
  if (issue) return {
    ...base,
    severity: "required",
    component: "plugin",
    code: "blocked-no-target",
    label: "\u63D2\u4EF6\u9700\u5904\u7406",
    message: `${issue.reason}\u6682\u65E0\u53EF\u5B89\u5168\u81EA\u52A8\u5B89\u88C5\u7684\u5339\u914D\u7248\u672C\uFF0C\u8BF7\u67E5\u770B\u53D1\u5E03\u8BF4\u660E\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u5347\u7EA7\u6216\u964D\u7EA7 DSH\u3002`,
    releaseUrl: `${RELEASE_REPOSITORY}/releases`
  };
  if (compatible) return { ...base, severity: "none", code: "compatible", label: "\u6682\u65E0\u53EF\u7528\u66F4\u65B0", message: "\u5F53\u524D\u7EC4\u5408\u5DF2\u9A8C\u8BC1\uFF0C\u6682\u672A\u53D1\u73B0\u9002\u7528\u4E8E\u6B64 DSH \u548C\u4E3B\u673A\u7684\u66F4\u65B0\u3002" };
  return {
    ...base,
    severity: "none",
    code: "no-update",
    label: "\u6682\u65E0\u53EF\u7528\u66F4\u65B0",
    message: "\u5F53\u524D\u901A\u9053\u6682\u65E0\u66F4\u9AD8\u7248\u672C\uFF0C\u4E0D\u5F71\u54CD\u7EE7\u7EED\u4F7F\u7528\u3002",
    releaseUrl: `${RELEASE_REPOSITORY}/releases`
  };
}
export {
  RELEASE_REPOSITORY,
  UPDATE_SCHEMA,
  assessUpdate,
  compareVersions,
  releaseMatches,
  trustedReleaseAsset,
  validateCatalog
};
