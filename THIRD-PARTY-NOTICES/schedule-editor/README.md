Pinned MIT sources from DeepSeek Harness `dsh-v0.2.2-rc.1` are used only for
lossless mobile form projection and typed edit requests. The Host Schedule
service remains the sole validator, store, timer and dispatcher. No profile,
task or Session data is stored here. See `provenance.json` and the license files.

`draft.ts` extracts the pure form functions before the React view in
`TaskEditorFields.tsx`. Its unused UI types and `projectChoices` are removed by
esbuild tree shaking. `editor-timing.ts` imports the same-tag time utilities
locally; their original implementations are otherwise retained.

To regenerate, install the locked dependencies from this directory into a
disposable build directory (`npm ci --ignore-scripts`), set
`SCHEDULE_EDITOR_NODE_MODULES` to that directory's `node_modules`, then run
`node scripts/build-schedule-editor.mjs` from the plugin root. This produces the
two checked-in `src/scheduled-tasks/*-native.ts` files. The runtime bundle is
loaded lazily only by the full editor. No new dependency is installed into a
user's DSH by these form helpers.
