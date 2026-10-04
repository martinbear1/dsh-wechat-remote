/** Shared data-only contract. Keep host decoders out of client/schema bundles. */
export const SUBMISSION_FILE_MAX = 10 * 1024 * 1024
export const SUBMISSION_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/plain', 'text/csv'] as const
export type SubmissionFileType = typeof SUBMISSION_FILE_TYPES[number]
export type SubmissionImageType = 'image/png' | 'image/jpeg'
const extensions: Record<SubmissionFileType, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx', 'text/plain': 'txt', 'text/csv': 'csv',
}
export function submissionFileType(value: unknown): value is SubmissionFileType { return SUBMISSION_FILE_TYPES.includes(value as SubmissionFileType) }
export function submissionImageType(value: unknown): value is SubmissionImageType { return value === 'image/png' || value === 'image/jpeg' }
export function submissionFileExtension(value: SubmissionFileType): string { return extensions[value] }
export function safeSubmissionName(value: unknown, mediaType: SubmissionFileType): string {
  if (typeof value !== 'string') return `submission.${extensions[mediaType]}`
  const name = value.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>:"|?*]/g, '_')
    .trim().slice(0, 120).replace(/[. ]+$/g, '')
  return !name || name === '.' || name === '..' ? `submission.${extensions[mediaType]}` : name
}
export const SUBMISSION_RECEIVE_FORMATS = { manifests: ['human.submission.manifest.v1', 'human.submission.manifest.v2'], mediaTypes: [...SUBMISSION_FILE_TYPES] } as const
