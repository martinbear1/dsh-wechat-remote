import { type HumanTaskRef } from '../human-tools/protocol.js';
import { type SubmissionFileType } from './submission-file-contract.js';
export declare const SUBMISSION_IMAGE_MAX: number;
export declare const SUBMISSION_CIPHER_MAX: number;
export declare const SUBMISSION_MANIFEST_MAX: number;
export interface SubmissionContext {
    schema: 'human.submission.context.v1';
    bindingKey: string;
    taskRef: HumanTaskRef;
    roundId: string;
    participantRef: string;
    submissionId: string;
    version: number;
    objectId: string;
    keyId: string;
}
export interface SubmissionEnvelope {
    schema: 'human.submission.box.v1';
    keyId: string;
    ephemeralPublicKey: string;
    nonce: string;
    cipherBytes: number;
    cipherDigest: string;
    manifestDigest: string;
}
export type SubmissionAnswers = Record<string, string | number | boolean | string[]>;
export interface ImageSubmissionManifest {
    schema: 'human.submission.manifest.v1';
    context: SubmissionContext;
    answers: SubmissionAnswers;
    file: {
        mediaType: 'image/png' | 'image/jpeg';
        plainBytes: number;
        plainDigest: string;
    };
}
export interface FileSubmissionManifest {
    schema: 'human.submission.manifest.v2';
    context: SubmissionContext;
    answers: SubmissionAnswers;
    file: {
        mediaType: SubmissionFileType;
        plainBytes: number;
        plainDigest: string;
        displayName: string;
    };
}
export type SubmissionManifest = ImageSubmissionManifest | FileSubmissionManifest;
export declare const sha512: (value: Uint8Array | string) => string;
export declare const sha256: (value: Uint8Array | string) => string;
export declare function canonicalSubmission(value: unknown): string;
export declare function base64Bytes(value: unknown, size: number): Uint8Array;
export declare function submissionContext(value: unknown): SubmissionContext;
export declare function submissionEnvelope(value: unknown): SubmissionEnvelope;
export declare function submissionAnswers(value: unknown): SubmissionAnswers;
export declare function submissionManifest(value: unknown): SubmissionManifest;
export declare function decryptSubmission(cipher: Uint8Array, raw: unknown, secretKey: Uint8Array, expected: SubmissionContext, values: SubmissionAnswers): {
    manifest: SubmissionManifest;
    data: Uint8Array;
    image: Uint8Array;
};
