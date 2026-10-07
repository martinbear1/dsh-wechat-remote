/* Generated from the shared plugin installation sources. */

// src/dsh-host-context.ts
import path from "node:path";
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

// src/install-capabilities.ts
var LEGACY_UPDATE_MANUAL_MESSAGE = "\u6B64\u5B89\u88C5\u7531 DSH Web \u547D\u4EE4\u884C\u7BA1\u7406\uFF0C\u4E0D\u652F\u6301\u4E00\u952E\u5728\u7EBF\u66F4\u65B0\u3002\u8BF7\u5148\u901A\u8FC7\u539F\u542F\u52A8\u65B9\u5F0F\u6B63\u5E38\u505C\u6B62 Web\uFF08\u540E\u53F0\u670D\u52A1\u9700\u6682\u505C\u81EA\u52A8\u91CD\u542F\uFF09\uFF0C\u518D\u6267\u884C\u539F\u5B89\u88C5\u547D\u4EE4\uFF1B\u539F\u751F\u5B89\u88C5\u5305\u8BF7\u4F7F\u7528 DSH \u63D2\u4EF6\u7BA1\u7406\u9875\u3002\u672A\u505C\u6B62\u6216\u4FEE\u6539\u5F53\u524D\u8282\u70B9\u3002";
function legacyUpdateError() {
  return Object.assign(new Error(LEGACY_UPDATE_MANUAL_MESSAGE), { code: "NATIVE_MANUAL_UPDATE_REQUIRED" });
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
async function quiesceNativeHost(_ctx, _read, _disposing) {
  throw legacyUpdateError();
}
async function createInstallControl(context, _config) {
  if (desktopOwnsLifecycle(context.root || context)) throw new Error("\u8BF7\u901A\u8FC7 DSH \u684C\u9762\u5E94\u7528\u7684\u63D2\u4EF6\u7BA1\u7406\u9875\u66F4\u65B0\uFF0C\u672A\u505C\u6B62\u8282\u70B9\u3002");
  throw legacyUpdateError();
}
var apply = async (ctx, config) => {
  await createInstallControl(ctx, config);
};
export {
  apply,
  createInstallControl,
  legacyUpdateError,
  nativeInstallSessions,
  quiesceNativeHost
};
