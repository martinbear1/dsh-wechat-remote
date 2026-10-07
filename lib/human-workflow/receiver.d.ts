import { type WorkflowScope } from './data.js';
import { type HumanTaskRef } from '../human-tools/protocol.js';
import { ReceiverKeyring } from './receiver-keyring.js';
import { type SubmissionContext, type SubmissionEnvelope, type SubmissionManifest, type SubmissionAnswers } from './submission-crypto.js';
import { type SubmissionFileType } from './submission-file-contract.js';
interface FileDeclaration {
    kind: 'file';
    mediaType: SubmissionFileType;
    plainBytes: number;
}
export interface ReceiverDelivery {
    claimId: string;
    leaseExpiresAt: number;
    submissionId: string;
    version: number;
    context: SubmissionContext;
    envelope: SubmissionEnvelope;
    values: SubmissionAnswers;
    download: unknown;
    attachment?: FileDeclaration;
}
export interface ReceiverOptions {
    root: string;
    nodeId: string;
    keys: ReceiverKeyring;
    assertIdentity(): void;
    download(ticket: unknown, bytes: number, signal: AbortSignal): Promise<Uint8Array>;
    validateImage(image: Uint8Array, mediaType: 'image/png' | 'image/jpeg'): Promise<void>;
    ack(origin: WorkflowScope, taskRef: HumanTaskRef, delivery: ReceiverDelivery, signal: AbortSignal): Promise<unknown>;
    maxBytes?: number;
    maxItems?: number;
    now?: () => number;
}
/** Ciphertext is the retained original. A committed directory contains both
 * the exact object and its durable receipt. There is no second index whose
 * transaction could falsely declare a missing file delivered. */
export declare class SubmissionReceiver {
    private readonly options;
    private readonly lifetime;
    private tail;
    private root;
    private constructor();
    static open(options: ReceiverOptions): Promise<SubmissionReceiver>;
    private check;
    private validateRaster;
    private serial;
    private directory;
    private readReceipt;
    private bytes;
    private verified;
    private recover;
    private capacity;
    receive(origin: WorkflowScope, taskRef: HumanTaskRef, bindingKey: string, raw: unknown, signal: AbortSignal): Promise<unknown>;
    private saveReceipt;
    /** Restore only ACK authority from a complete local original, never a new
     * download ticket. Older receipts without claimId remain compatible but do
     * not invent proof. All bytes and bound fields are verified before the call. */
    recoverReceipt(origin: WorkflowScope, taskRef: HumanTaskRef, bindingKey: string, submissionId: string, version: number, claim: (proof: {
        claimId: string;
        version: number;
        manifestDigest: string;
        cipherDigest: string;
    }) => Promise<unknown>, signal: AbortSignal): Promise<boolean>;
    read(origin: WorkflowScope, submissionId: string, bindingKey: string, signal: AbortSignal): Promise<{
        artifactRef: string;
        receivedAt: number;
        manifest: SubmissionManifest;
        data: Uint8Array;
        image: Uint8Array;
    }>;
    /** Explicit authorized access creates a private, system-named plaintext copy.
     * It is inert data, not a command or a trustworthy instruction. The retained
     * original remains ciphertext; user filenames are never joined into paths. */
    exportFile(origin: WorkflowScope, submissionId: string, bindingKey: string, signal: AbortSignal): Promise<{
        path: string;
        displayName: string;
        mediaType: "image/jpeg" | "image/png" | "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "text/plain" | "text/csv";
        bytes: number;
        sha256: string;
        manifest: SubmissionManifest;
        receivedAt: number;
        artifactRef: string;
    }>;
    close(): Promise<void>;
}
export {};
