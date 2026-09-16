import type { Context } from '@deepseek-ai/cordis';
export declare function sessionExportAvailable(ctx: Context): boolean;
/** Only called behind the paired client's authenticated RPC boundary. Use the
 * mounted native route: persistence, attachments and descendants stay DSH-owned.
 * Never fetch a caller-provided URL, read log files, or recreate the ZIP format. */
export declare function exportSessionArchive(ctx: Context, scope: string, signal: AbortSignal, maxBytes: number): Promise<{
    data: Buffer;
    name: string;
}>;
