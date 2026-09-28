/* Generated from the shared plugin installation sources. */

// src/update-session-verification.ts
async function verifySessionService(read, previouslyReadable) {
  const items = (await read("session.list"))?.items;
  if (!Array.isArray(items) || items.some((item) => !item || typeof item.sessionId !== "string" || !item.sessionId || typeof item.running !== "boolean") || new Set(items.map((item) => item.sessionId)).size !== items.length) {
    throw new Error("\u4E3B\u673A\u4F1A\u8BDD\u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6548\u7684\u4F1A\u8BDD\u5217\u8868");
  }
  const visible = new Set(items.map((item) => item.sessionId));
  for (const sessionId of new Set(previouslyReadable)) {
    if (visible.has(sessionId)) await read("session.history", { sessionId, maxMessages: 1 });
  }
}
export {
  verifySessionService
};
