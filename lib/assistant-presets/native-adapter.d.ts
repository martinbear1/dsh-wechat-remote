import { type AssistantDefinition } from './definition.js';
import type { NativeAssistantAdapter, NativeAssistantPreview } from './types.js';
type Row = Record<string, unknown>;
interface Host {
    get(name: string): unknown;
}
/** Native YAML reader is injectable for hosts with bundled module resolution.
 * It reads native declarations only; no model supplies YAML to this boundary. */
export interface NativePresetCodec {
    load(content: string): unknown;
}
export interface NativeAssistantAdapterOptions {
    codec?: NativePresetCodec;
}
export declare const COLLABORATION_COMPONENT_ID = "harness-collaboration";
declare const collaborationModules: readonly ["dsh-wechat-remote/collaboration", "@harness-remote/dsh-wechat-remote/collaboration"];
/** The Desktop bundle contains this core under native/. Its public outer
 * self-reference must be used by separately installed preset packages; the CLI
 * core instead owns its scoped npm name. Never infer this from another profile. */
export declare function nativeCollaborationModule(): typeof collaborationModules[number];
/** Check the actual retained native preset scope, never host-global tools or
 * skills and never an Agent creation. Startup probes must not call this: a
 * collaboration component can still be waiting for its shared service. */
export declare function nativeAssistantCapabilitiesReady(host: Host, presetId: string, signal: AbortSignal): Promise<boolean>;
export declare const nativeAssistantCompositionDigest: (value: unknown) => string;
export declare function parseNativeAssistantBase(codec: NativePresetCodec, document: unknown, expected: string): Row[];
export declare function transformNativeAssistantBase(base: Row[], definition: AssistantDefinition): Row[];
/** Validate a persisted plan before a core accepts it from its local ledger.
 * This is structural integrity, NOT owner approval or proof that the inherited
 * composition is still current. install additionally rebuilds from the native
 * registry; the caller still owns signed/expiring explicit approval. */
export declare function validateNativeAssistantPreview(value: unknown): NativeAssistantPreview;
export declare function nativeAssistantCodec(anchor: string): Promise<NativePresetCodec>;
/** Public owner-management route, identical to the native plugin page. It
 * intentionally never enters plugin_manager's Agent tool or fabricates its
 * permission context. Main core owns exact preview consent on a private RPC.
 * Native package/compatibility/script checks remain in installBundle. */
export declare function createNativeAssistantAdapter(host: Host, options?: NativeAssistantAdapterOptions): NativeAssistantAdapter;
export {};
