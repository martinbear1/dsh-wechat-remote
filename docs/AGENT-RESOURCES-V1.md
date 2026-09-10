# Agent resources v1 — research contract

Status: implemented on `research/agent-resources-20260910`, not published. Based on plugin 1.7.1 (`a9cc40b`), mini-program 1.7.0 (`2a196f7`), relay 1.2.10 (`3dd12d9`). Version numbers in the manifests still identify the base, **not a new released artifact**.

## Boundary

The client deals with a session-like **scope**, opaque resource IDs, optional capabilities, files, and byte delivery. DSH paths, workspaceFiles, compact model streams, and deliverables/presented are adapter details. A Claude Code/Codex adapter can implement this namespace without exposing DSH events. No support for those Agents is claimed yet.

RPC namespace `agentResources`. Calls use the existing authenticated control carrier; this service opens no new port. Payload is `{args:{request:{...}}}`. The service result is `{ok:true,valueJson:"..."}` or `{ok:false,error:{code,message}}`, inside the carrier's normal result. `valueJson` is versioned JSON (avoids a dependency on native Agent TypeScript types in generated Typert declarations).

| Method | Request | Successful JSON value |
| --- | --- | --- |
| capabilities | scope | schema `agent.resources.v1`, browse, resolve, download, delivery, maxBytes, chunkBytes |
| list | scope, optional directoryId, cursor | schema, directoryId, parentId, label, entries, nextCursor, truncated |
| resolve | scope, reference | one resource record, including parentId |
| prepare | scope, id, delivery `chunks` or `object` | name, bytes, version, sha256, sha512, delivery; plus transferId/chunkBytes/expiresAt or descriptor |
| chunk | scope, transferId, offset | offset, base64 data, eof |
| release | scope, transferId | released |

Resource record: `{id,name,kind:"file"|"directory",bytes:number|null,parentId}`. `reference` is an adapter-owned reference obtained from an assistant link or presentation facet. The client treats it as opaque; a filename alone is not an authorization token. The DSH adapter supports workspace-relative/contained absolute paths and scoped `dsh-resource://file/session/...` URIs. It deliberately refuses files outside the current workspace even though native DSH stat/read can read them.

Capabilities are checked per scope/connection; missing namespace, unknown schema, disabled package or offline node hides the entry. Native file names and OS error messages are untrusted display text, never commands/HTML. Another adapter may advertise fewer capabilities; additions should be optional fields or new schema versions, not client-side DSH version checks.

## Presentation

The adapter augments, never renumbers, durable event entries:

```json
{"view":{"agentResources":{"schema":"agent.resources.v1","turn":3,"files":[{"reference":"outputs/report.xlsx","name":"report.xlsx","description":"Report"}]}}}
```

A generic client attaches these files to the corresponding assistant turn. A local Markdown link may also request resolution. Code-span basenames are clickable only when exactly one presented resource matches; ambiguous text stays text. Original web links keep their existing behavior. A missing file is an ordinary recoverable error, not a command to search outside the workspace.

For unfinished assistant attempts, optional `view.agentTranscript` has schema `agent.transcript.v1`, kind `assistant-attempt`, turn, step and a normalized `{id,role:"assistant",content}` message. This preserves interrupted text without copying native compact-stream decoding into the client. Successful retry/final messages replace the unfinished prefix.

## Byte delivery, limits and trust

1. List/resolve use native workspace containment and mint scope-bound HMAC IDs (one-hour validity; restart invalidates them).
2. Prepare revalidates the directory, pins the canonical native file, reads bounded byte windows, checks canonical path/version/length on each read and after completion. It creates an immutable snapshot, not a live file stream that may mix revisions.
3. LAN: encrypted direct carrier, 192 KiB byte windows. Snapshots expire after five minutes, are explicitly released, and are bounded to 16 entries/48 MiB; at most two preparations at once. Disposal clears them.
4. Public: computer encrypts the bytes, uploads ciphertext as existing OSS purpose `artifact`, and sends the authenticated descriptor through E2EE. The phone fetches OSS ciphertext and decrypts locally. No public fallback sends the entire file through the relay. Cloud has no plaintext file/decryption key.
5. Client verifies byte length and mandatory SHA-512, writes one app-private temporary file with a sanitized basename, and deletes it when the panel closes, the node/scope changes or the component detaches. Cancellation discards late results.

First iteration: 20 MiB per file, directories paged 100 at a time (subject to native listing cap), UTF-8 text preview at most 256 KiB. These are deliberate mobile-memory bounds, not claims that DSH or OSS cannot handle larger files. Deletion, rename, writes, arbitrary HTML execution and whole-workspace export are not exposed. Filesystem changes by external programs require manual refresh; native `changes` is an observed-operation feed, not a full OS watcher.

OSS avoids ECS relay bandwidth, **not the account's public quota**. Existing cloud accounting authorizes the owner/node and counts the encrypted size when issuing a download ticket. Cached local preview/forward reuses one file. A new download ticket can consume quota again; no quota reset, payment or entitlement changes are included in this branch.

## DSH 0.1.5-rc.1 streaming compatibility

Native follow must opt in with `assistantStream:true`. `assistant-stream` revision/index belong to an ephemeral model attempt and must never advance the durable Session cursor. The plugin restores compact snapshot runs, forwards text/reasoning chunks in the released client vocabulary, resets abandoned attempts, and reconnects on gaps. The new mini client stores the current stream separately from its bounded history-replay buffer.

V3 keeps token samples under settled message/attempt `data.stream`. Turn timings now read the original compact timestamps; accounting still uses the running DSH's native usage fold. Optimized history removes redundant native samples only from the transport projection **after** extracting timing/partial presentation; native logs remain unchanged.

Source audited: [DSH 0.1.5-rc.1 fixed commit](https://github.com/deepseek-ai/deepseek-harness/tree/183f08e9c6dde7e36cd2318eaee70b0da08fb35e), especially `packages/api/session-controller`, `packages/api/workspace-files`, `packages/llm/llm/src/assistant-stream.ts`, and `packages/client/ui-deliverables`.

## Verification / remaining gate

- Build, artifact verification, full existing plugin regression suite and new resource/stream/compact-timing tests pass.
- Cross-end tests use the real compatibility RPC mapper, resource adapter, object encryption/decryption and generic client: same LAN/OSS bytes, no public chunk fallback, altered ciphertext rejection, scope isolation, local cleanup.
- Windows DSH 0.1.5-rc.1 read-only native probe listed five entries and exported 1,615 bytes with matching hash; wrong scope rejected. Zero model prompts or remote mutations.
- Recent Windows turn 13 (2026-09-10 around 15:09) contains 458 final-text deltas over 2,474 ms. Released plugin 1.7.1 does not opt in to that transient stream. This is a confirmed compatibility gap, not merely an inference that the model was fast.
- No live plugin installation, host restart, relay deployment, npm publication or mini-program upload was performed. Mac/Ubuntu and actual phone Office preview/file forwarding still require controlled next-stage validation.

Other reviewed upstream changes: V2/V3 log migration stays native; Session address/Agent parameter changes, projection/model/queue adapters keep existing tests; file references are not automatically safe filesystem authority; observed file notifications do not guarantee external-shell refresh. Earlier RC/alpha behavior is covered by compatibility fixtures, not a newly executed full real-host version matrix.
