export interface ZipEntry {
    name: string;
    start: number;
    bytes: number;
    expanded: number;
    method: number;
    crc: number;
}
export interface ZipReader {
    entries: ReadonlyMap<string, ZipEntry>;
    read(name: string, maximum: number): Promise<Buffer>;
    hash(): Promise<string>;
    close(): Promise<void>;
}
export declare function crc32(bytes: Uint8Array): number;
/** Random access on a plugin-owned staging file. No archive path is extracted.
 * Every declared range is validated before reading selected entries. Inflate
 * runs only in the bounded parser worker, with an enforced output ceiling. */
export declare function openZipFile(file: string | Buffer): Promise<ZipReader>;
