/** Applied once by the build-owned manifest footer, before legacy schema
 * accessors are attached. Both old .schema readers and lazy .create readers
 * therefore receive the same Zod schema and native validation error contract.
 */
export declare function attachInputSizeBounds(manifest: any): void;
