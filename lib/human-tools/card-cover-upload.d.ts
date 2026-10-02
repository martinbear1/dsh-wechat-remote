import type { CardCoverImage } from './card-cover-assets.js';
/** Only cloud-issued, same-object private OSS tickets. No model destination,
 * redirects, bearer headers or upload of files other than the pinned bytes. */
export declare function coverTransfer(value: unknown, method: 'GET' | 'PUT', image?: CardCoverImage, md5?: string): {
    url: string;
    headers: Record<string, string>;
}[];
export declare function uploadCardCover(ticket: unknown, image: CardCoverImage, md5: string, signal: AbortSignal, fetcher?: typeof fetch): Promise<void>;
