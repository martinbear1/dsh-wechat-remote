import { type CapabilityManifest } from './capabilities.js';
import { type WorkflowDataStore, type WorkflowScope } from './data.js';
export type ModeField = {
    key: string;
    label: string;
    required: boolean;
} & ({
    kind: 'short-text' | 'long-text';
    maxLength: number;
} | {
    kind: 'choice';
    choices: string[];
} | {
    kind: 'boolean';
} | {
    kind: 'number';
    min: number;
    max: number;
});
export interface ModePackage {
    schemaVersion: 1;
    name: string;
    description: string;
    goal: string;
    roles: {
        id: string;
        label: string;
    }[];
    rules: string[];
    requiredCapabilities: string[];
    allowedTools: string[];
    inputSchema: {
        fields: ModeField[];
    };
    resultSchema: {
        fields: ModeField[];
    };
    card: {
        kind: 'reading-confirmation';
        titleField: string;
        bodyFields: string[];
    };
    approval: {
        activation: 'owner';
        publication: 'owner';
    };
    automation: 'manual';
    onboarding?: {
        questions: {
            field: ModeField;
            prompt: string;
        }[];
    };
}
export interface ModeIssue {
    code: string;
    path: string;
    message: string;
}
export interface ModeValidation {
    ok: boolean;
    issues: ModeIssue[];
}
export interface ModeReference {
    id: string;
    version: number;
    digest: string;
}
export interface ModeActivation {
    schema: 'human.mode.activation.v1';
    revision: number;
    mode: ModeReference | null;
}
export interface ModePreview extends ModeReference {
    schema: 'human.mode.preview.v1';
    previewId: string;
    expiresAt: number;
    expectedActivationVersion: number;
    package: ModePackage;
    validation: ModeValidation;
    capabilities: CapabilityManifest['capabilities'];
    previouslyApproved: boolean;
}
export interface ModeApproval extends ModeReference {
    previewId: string;
    expectedActivationVersion: number;
}
export interface ModeRegistryOptions {
    nodeId: string;
    capabilities(): CapabilityManifest;
    randomId(): string;
    now?: () => number;
}
/** Fixed data language only. No templates, code, URLs, event handlers, imports
 * or external renderer references are accepted as executable configuration. */
export declare function parseModePackage(value: unknown): ModePackage;
export declare function modeDigest(value: ModePackage): string;
export declare function validateModePackage(value: unknown, manifest: CapabilityManifest): ModeValidation;
export declare function validateModeValues(schema: {
    fields: ModeField[];
}, value: unknown, requireAll?: boolean): Record<string, unknown>;
export declare function renderModeCard(mode: ModePackage, values: unknown): {
    title: string;
    body: string;
};
export declare class ModeRegistry {
    private readonly state;
    private readonly options;
    private readonly now;
    private constructor();
    static open(store: WorkflowDataStore, options: ModeRegistryOptions): Promise<ModeRegistry>;
    close(): Promise<void>;
    manifest(): CapabilityManifest;
    private check;
    private active;
    private find;
    list(scope: WorkflowScope): {
        schema: "human.mode.list.v1";
        modes: {
            id: string;
            name: string;
            latestVersion: number;
            approvedVersions: number[];
        }[];
        activation: ModeActivation;
    };
    get(scope: WorkflowScope, request: {
        id: string;
        version: number;
    }): {
        previouslyApproved: boolean;
        version: number;
        digest: string;
        package: ModePackage;
        createdAt: number;
        createdBy: WorkflowScope;
        approvedAt?: number;
        schema: "human.mode.version.v1";
        id: string;
    };
    draft(scope: WorkflowScope, request: {
        id?: string;
        expectedVersion?: number;
        package: unknown;
    }, signal: AbortSignal): Promise<{
        previouslyApproved: boolean;
        validation: ModeValidation;
        version: number;
        digest: string;
        package: ModePackage;
        createdAt: number;
        createdBy: WorkflowScope;
        approvedAt?: number;
        schema: "human.mode.version.v1";
        id: string;
    }>;
    preview(scope: WorkflowScope, request: {
        id: string;
        version: number;
    }, signal: AbortSignal): Promise<ModePreview>;
    /** Host owner RPC only. Never expose this method as an Agent tool. */
    approve(scope: WorkflowScope, request: ModeApproval, signal: AbortSignal): Promise<ModeActivation>;
    /** Host owner RPC only; a rollback still gets an exact fresh preview. */
    rollback(scope: WorkflowScope, request: ModeApproval, signal: AbortSignal): Promise<ModeActivation>;
    private activate;
    requireActive(scope: WorkflowScope, ref: ModeReference): ModePackage;
    requireApproved(scope: WorkflowScope, ref: ModeReference): ModePackage;
}
