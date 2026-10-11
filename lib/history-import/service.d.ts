import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
export interface HistoryImportResult {
    readonly ok: boolean;
    readonly valueJson?: string;
    readonly error?: {
        readonly code: string;
        readonly message: string;
    };
}
/** A separate optional RPC behind the existing owner-authenticated transport.
 * No replacement of native session.create/history, no hooks in chat execution,
 * no startup IO and no additional server/listener/cloud service. */
export declare class WechatImportService extends TypertRemoteService {
    private readonly controller;
    constructor(host: Context, config: {
        receiptDirectory: string;
    });
    control(request: {
        action: string;
        inputJson?: string;
    }, signal: AbortSignal): Promise<HistoryImportResult>;
}
