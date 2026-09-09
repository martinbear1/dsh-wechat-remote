# Optional per-turn presentation

`wechatHistory/window` carries an additive `facets['agent.turn-details.v1']`
array in its decoded history payload. Each entry identifies `turnId` (opaque
string) and the closing `messageId`. Old consumers ignore it. Consumers render
only known, present fields; providers without these readings omit the facet.

- `usage`: `total`, uncached `input`, `output`, optional `cacheRead`,
  `cacheWrite`, `reasoning`, `models: [{provider, model}]`. Token counts, not
  currency. Cache buckets are disjoint input; reasoning is a subset of output.
- `timing`: `elapsedMs`, optional `firstTokenMs`, `outputTokensPerSecond`.
  Elapsed is wall time, not summed request time. Throughput is weighted by
  sampled decode duration, not an average of per-step rates.

The DSH adapter resolves the running host's public
`@deepseek-ai/dsh-token-meter/client` export and calls `deriveTurnTokenUsage`.
It never imports a different bundled DSH or reimplements retry accounting.
Missing export or incomplete native accounting omits usage. Timing follows
the native assistant step boundaries and non-empty delta semantics.

Projection occurs before history transport removes completed chunks. Only
complete loaded turns are disclosed; partial pages and live unfinished turns
are omitted. The existing terminal-history reconciliation populates the
footer after a live turn. Older-page facets merge by message identity and
fresh history replaces the map. Session switching does not share maps.

Mini-program pages know only the portable presentation; no token accounting
or DSH event handling is added there. A different agent can emit the same
facet without using DSH events. No cloud persistence or relay wire change.

Verification: pure boundaries/partial pages/timing/pre-compaction tests;
installed DSH 0.1.2-rc.1 native readings compared with the encrypted history
endpoint; mini-program light/dark dialog, one-row footer, toggle, scrolling,
and missing-facet checks. Phone acceptance remains a separate user test.
