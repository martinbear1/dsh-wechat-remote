import { type HumanCardAsset } from './card-cover.js';
import { type WorkflowDataStore, type WorkflowScope } from '../human-workflow/data.js';
import type { WorkflowTransport } from '../human-workflow/transport.js';
export type CardCoverSource = {
    kind: 'attachment';
    attachmentId: string;
} | {
    kind: 'workspace';
    reference: string;
};
export interface CardCoverImage {
    data: Uint8Array;
    mediaType: 'image/png' | 'image/jpeg';
    width: number;
    height: number;
}
export declare function cardCoverSource(value: unknown): CardCoverSource | undefined;
export interface CardCoverAssetsOptions {
    transport: WorkflowTransport;
    store: WorkflowDataStore;
    read(scope: WorkflowScope, source: CardCoverSource, signal: AbortSignal): Promise<CardCoverImage>;
    upload(ticket: unknown, image: CardCoverImage, md5: string, signal: AbortSignal): Promise<void>;
    now?: () => number;
}
export declare const CARD_COVER_LEDGER_MAX_BYTES: number;
/** One serialized writer per actual node/profile. Commit exact bytes before
 * requesting an OSS object; every retry uses the persisted request and bytes.
 * No model execution, publication, owner download ticket or secret in output. */
export declare class CardCoverAssets {
    private readonly options;
    private readonly state;
    private readonly lifetime;
    private tail;
    private constructor();
    static open(options: CardCoverAssetsOptions): Promise<CardCoverAssets>;
    private now;
    private active;
    assertAsset(scope: WorkflowScope, asset: HumanCardAsset): void;
    prepare(scope: WorkflowScope, source: CardCoverSource, rootCallId: string, signal: AbortSignal): Promise<HumanCardAsset>;
    preview(scope: WorkflowScope, asset: HumanCardAsset, requestId: string, signal: AbortSignal): Promise<unknown>;
    close(): Promise<void>;
}
