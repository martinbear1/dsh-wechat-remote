/** Native attachment request selection. No network probing or version guesses. */
import type { Context } from '@deepseek-ai/cordis';
type Row = Record<string, any>;
export interface DurableImageReference {
    attachmentId: string;
    mediaType: string;
    bytes: number;
    width: number;
    height: number;
    name?: string;
    originalDimensions?: {
        width: number;
        height: number;
    };
}
export declare function imageReference(value: unknown): DurableImageReference | undefined;
export declare function nativeAttachmentField(ctx: Pick<Context, 'get'>): 'attachmentId' | 'attachment';
/** Same durable content locations as native RC3 attachment admission. This
 * compatibility lookup is only for id-only consumers (including group covers).
 * Modern phone reads already carry the recorded reference and do not scan history. */
export declare function referencedSessionImage(events: readonly Row[], id: string, signal?: AbortSignal): DurableImageReference | undefined;
export declare function nativeAttachmentRequest(ctx: Pick<Context, 'get'>, request: Row, signal?: AbortSignal): Promise<Row>;
export {};
