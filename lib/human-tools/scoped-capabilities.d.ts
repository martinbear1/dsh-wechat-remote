import type { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
type Dispose = () => void;
type Contribution = (ctx: Context) => Dispose;
/** Shared implementations, not a host ToolRuntime registration. Only an
 * explicit native preset/agent composition may publish these contributions.
 * The backend owns storage; each mount owns its model-visible registrations. */
export declare class ScopedCapabilities {
    private readonly lifetime;
    private readonly authorize?;
    private readonly definitions;
    private readonly contributions;
    private readonly mounts;
    private closed;
    constructor(lifetime: AbortSignal, authorize?: ((tool: string, signal: AbortSignal) => Promise<void>) | undefined);
    has(name: string): boolean;
    add(tool: ToolDefinition): Dispose;
    contribute(register: Contribution): Dispose;
    mount(ctx: Context): Dispose;
    close(): void;
    private assertPreparing;
}
export {};
