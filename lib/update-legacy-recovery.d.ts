export interface LegacyRecoveryJob {
    id: string;
    directory: string;
    home: string;
    profile: string;
    stateFile: string;
    webPort: number;
    gatePort: number;
    localPort: number;
    statusToken: string;
    targetVersion: string;
    previousVersion: string;
    dshVersion: string;
    cli?: string;
    argv?: string[];
    manager?: {
        kind: string;
        unit?: string;
    };
}
export interface LegacyRecoveryRequest {
    job: LegacyRecoveryJob;
    workerOrigin: string;
}
export interface RecoveryDataProof {
    files: number;
    appended: {
        file: string;
        originalSha256: string;
        currentSha256: string;
        originalBytes: number;
        currentBytes: number;
    }[];
}
/** Bounded streaming byte-prefix proof, not a JSON rewrite or a zstd decoder.
 * For compressed native append logs, the old digest must match exactly before
 * a new frame's magic. Even an incidental magic cannot forge the old SHA256.
 * Together with native history reads this proves preservation and availability,
 * not complete semantic validation of every newly appended on-disk frame.
 */
export declare function verifyLegacyRecoveryData(job: LegacyRecoveryJob, signal: AbortSignal): Promise<RecoveryDataProof>;
/** Inverse of official dsh-session-persistence-jsonl encodeSegment (rc.2,
 * lib/index.js:853): escapes UTF-16 code units, including lone surrogates, as
 * uppercase ~XXXX. This value is only a native RPC identity, never a path.
 */
export declare function decodeLegacySessionDirectory(segment: string): string;
/** Must observe a live active worker itself; disk journals cannot start recovery. */
export declare function runLegacyRecovery(request: LegacyRecoveryRequest, ready?: () => void): Promise<void>;
/** Called only by an already authenticated Web handoff. Failure is diagnostic,
 * never an exception on the ordinary upgrade/startup path. */
export declare function startLegacyRecovery(request: LegacyRecoveryRequest): Promise<void>;
