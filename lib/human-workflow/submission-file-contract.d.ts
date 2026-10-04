/** Shared data-only contract. Keep host decoders out of client/schema bundles. */
export declare const SUBMISSION_FILE_MAX: number;
export declare const SUBMISSION_FILE_TYPES: readonly ["image/jpeg", "image/png", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "text/csv"];
export type SubmissionFileType = typeof SUBMISSION_FILE_TYPES[number];
export type SubmissionImageType = 'image/png' | 'image/jpeg';
export declare function submissionFileType(value: unknown): value is SubmissionFileType;
export declare function submissionImageType(value: unknown): value is SubmissionImageType;
export declare function submissionFileExtension(value: SubmissionFileType): string;
export declare function safeSubmissionName(value: unknown, mediaType: SubmissionFileType): string;
export declare const SUBMISSION_RECEIVE_FORMATS: {
    readonly manifests: readonly ["human.submission.manifest.v1", "human.submission.manifest.v2"];
    readonly mediaTypes: readonly ["image/jpeg", "image/png", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "text/csv"];
};
