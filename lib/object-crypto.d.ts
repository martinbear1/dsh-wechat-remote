declare const ATTACHMENT_SCHEME = "xsalsa20-poly1305-chunks-v1";
export interface EncryptedCloudObjectDescriptor {
    readonly v: 1;
    readonly scheme: typeof ATTACHMENT_SCHEME;
    readonly objectId: string;
    readonly key: string;
    readonly noncePrefix: string;
    readonly plainBytes: number;
    readonly cipherBytes: number;
    readonly chunkBytes: number;
    readonly contentKind: 'image' | 'history-json' | 'artifact';
    readonly contentEncoding?: 'zip';
    readonly mediaType?: string;
    readonly name?: string;
}
export interface RemoteAttachmentDescriptor {
    readonly v: 1;
    readonly scheme: typeof ATTACHMENT_SCHEME;
    readonly objectId: string;
    readonly key: string;
    readonly noncePrefix: string;
    readonly plainBytes: number;
    readonly cipherBytes: number;
    readonly chunkBytes: number;
    readonly contentKind?: 'image';
    readonly mediaType: string;
    readonly name?: string;
}
export declare function validateRemoteAttachment(value: unknown): RemoteAttachmentDescriptor;
export declare function encryptCloudObject(plaintext: Uint8Array, contentKind: EncryptedCloudObjectDescriptor['contentKind']): {
    readonly ciphertext: Uint8Array;
    readonly descriptor: Omit<EncryptedCloudObjectDescriptor, 'objectId'>;
};
export declare function decryptCloudObject(ciphertext: Uint8Array, raw: EncryptedCloudObjectDescriptor): Uint8Array;
export declare function decryptRemoteAttachment(ciphertext: Uint8Array, raw: unknown): {
    descriptor: RemoteAttachmentDescriptor;
    data: Uint8Array;
};
export {};
