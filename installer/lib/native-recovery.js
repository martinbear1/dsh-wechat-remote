import { createRequire as recoveryRequire } from 'node:module'; const require = recoveryRequire(import.meta.url);

// installer/lib/install-control.js
var LEGACY_UPDATE_MANUAL_MESSAGE = "\u6B64\u5B89\u88C5\u7531 DSH Web \u547D\u4EE4\u884C\u7BA1\u7406\uFF0C\u4E0D\u652F\u6301\u4E00\u952E\u5728\u7EBF\u66F4\u65B0\u3002\u8BF7\u5148\u901A\u8FC7\u539F\u542F\u52A8\u65B9\u5F0F\u6B63\u5E38\u505C\u6B62 Web\uFF08\u540E\u53F0\u670D\u52A1\u9700\u6682\u505C\u81EA\u52A8\u91CD\u542F\uFF09\uFF0C\u518D\u6267\u884C\u539F\u5B89\u88C5\u547D\u4EE4\uFF1B\u539F\u751F\u5B89\u88C5\u5305\u8BF7\u4F7F\u7528 DSH \u63D2\u4EF6\u7BA1\u7406\u9875\u3002\u672A\u505C\u6B62\u6216\u4FEE\u6539\u5F53\u524D\u8282\u70B9\u3002";
function legacyUpdateError() {
  return Object.assign(new Error(LEGACY_UPDATE_MANUAL_MESSAGE), { code: "NATIVE_MANUAL_UPDATE_REQUIRED" });
}

// installer/bin/native-recovery.mjs
async function verifyNativeRestore() {
  throw legacyUpdateError();
}
export {
  verifyNativeRestore
};
