type Native = Record<string, any>;
export declare function nativeAutomationToolsSupported(tools: Native | undefined, prompt: Native | undefined): boolean;
/** Legacy hosts offer a reversible presentation lease. Current hosts do not:
 * disposing setExecutor deliberately leaves an unavailable selection. Verify
 * the owning composition's REAL model declarations instead, and never replace
 * that executor. PTC-only/custom transports cannot be widened to direct calls:
 * automation's existing guard forbids nested execution. Dispose temporary
 * step admission before returning; no executor or admission lease survives. */
export declare function prepareAutomationTools(agent: Native, names: readonly string[], modelSelection: Native, signal: AbortSignal): Promise<() => void>;
export {};
