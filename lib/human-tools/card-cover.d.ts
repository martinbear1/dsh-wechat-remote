/** Immutable public reference only. An asset-shaped value is not authority;
 * the node ledger and cloud must both confirm its origin and ready state. */
export interface HumanCardAsset {
    readonly schema: 'human.card.asset.v1';
    readonly assetRef: string;
    readonly sha256: string;
    readonly bytes: number;
    readonly mediaType: 'image/png' | 'image/jpeg';
    readonly width: number;
    readonly height: number;
}
export declare const HUMAN_CARD_ASSET_MAX_BYTES: number;
export declare function humanCardAsset(value: unknown): HumanCardAsset | undefined;
export declare const HUMAN_CARD_ASSET_SCHEMA: {
    readonly type: "object";
    readonly description: "Exact PUBLIC cover asset returned by human_card_cover_prepare. Never invent its reference/digest, supply paths/URLs, or reuse another session asset. The owner previews the actual image before sharing.";
    readonly properties: {
        readonly schema: {
            readonly type: "string";
            readonly enum: readonly ["human.card.asset.v1"];
        };
        readonly assetRef: {
            readonly type: "string";
        };
        readonly sha256: {
            readonly type: "string";
        };
        readonly bytes: {
            readonly type: "integer";
        };
        readonly mediaType: {
            readonly type: "string";
            readonly enum: readonly ["image/png", "image/jpeg"];
        };
        readonly width: {
            readonly type: "integer";
        };
        readonly height: {
            readonly type: "integer";
        };
    };
    readonly required: readonly ["schema", "assetRef", "sha256", "bytes", "mediaType", "width", "height"];
    readonly additionalProperties: false;
};
/** Covers belong only to a public new round, never private correction or
 * reminder/review content. Other content rules remain cloud-authoritative. */
export declare function lifecycleCoverValid(kind: 'round' | 'review' | 'reminder', content: Record<string, unknown>): boolean;
