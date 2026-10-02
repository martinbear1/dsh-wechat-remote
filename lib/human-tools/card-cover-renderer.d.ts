export interface CardCoverImage {
    data: Uint8Array;
    mediaType: 'image/png' | 'image/jpeg';
    width: number;
    height: number;
}
/** Decode and re-encode on the computer to remove metadata. No silent crop.
 * The returned final pixels/bytes, not the input file, are what gets approved. */
export declare function normalizeCardCoverImage(data: Uint8Array, mediaType: 'image/png' | 'image/jpeg', signal: AbortSignal): Promise<CardCoverImage>;
