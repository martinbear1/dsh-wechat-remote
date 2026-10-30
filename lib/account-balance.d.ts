/** Display-only projection over the current DSH host's public account service.
 * No credential/Platform-session access, HTTP endpoints, filesystem or model tools. */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
export declare const ACCOUNT_CAPABILITY = "dsh.account-balance";
export interface AccountReadRequest {
    readonly locale: string;
    readonly timezoneOffsetSeconds: number;
}
export interface AccountWalletView {
    readonly currency: 'CNY' | 'USD';
    readonly balance: string;
}
export interface AccountReadValue {
    readonly schemaVersion: 1;
    readonly status: 'ready' | 'signed-out' | 'unsupported' | 'unavailable';
    readonly profile: {
        readonly status: 'ready' | 'failed';
        readonly name: string;
        readonly contact: string;
    };
    readonly balance: {
        readonly status: 'ready' | 'failed';
        readonly wallets: readonly AccountWalletView[];
        readonly bonusWallets: readonly AccountWalletView[];
    };
    readonly updatedAt: number | null;
}
export type AccountReadResult = {
    readonly ok: true;
    readonly value: AccountReadValue;
} | {
    readonly ok: false;
    readonly error: {
        readonly code: string;
        readonly message: string;
    };
};
declare module '@deepseek-ai/cordis' {
    interface Context {
        wechatAccount: WechatAccountService;
    }
    interface Events {
        /** Invalidation only; account identifiers and balances are never broadcast.
         * @mode emit */
        'wechatAccount/changed'(value: {
            supported: boolean;
        }): void;
    }
}
export declare function maskedContact(v: unknown): string;
export declare function walletViews(v: unknown): AccountWalletView[] | null;
export declare class WechatAccountService extends TypertRemoteService {
    private readonly provider;
    private generation;
    private pending?;
    private readonly lifetime;
    private watchReady;
    constructor(ctx: Context);
    available(): boolean;
    private changed;
    read(request: AccountReadRequest, signal: AbortSignal): Promise<AccountReadResult>;
    private query;
}
export default WechatAccountService;
