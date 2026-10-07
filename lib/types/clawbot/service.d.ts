import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { type ClawbotRequest, type ClawbotStatus, type ClawbotSession } from './contracts.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        wechatClawbot: WechatClawbotService;
    }
}
export type ClawbotControlResult = {
    ok: true;
    value: ClawbotStatus | {
        sessions: ClawbotSession[];
    };
} | {
    ok: false;
    error: {
        code: string;
        message: string;
    };
};
/** Exposed only through the owning native authenticated gateway (or the existing
 * authenticated LAN/E2EE control path). Never a model-callable tool. */
export declare class WechatClawbotService extends TypertRemoteService {
    private runtime?;
    constructor(ctx: Context);
    available(): boolean;
    control(request: ClawbotRequest, signal: AbortSignal): Promise<ClawbotControlResult>;
}
