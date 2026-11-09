/** Additive, owner-authenticated mobile view of the native DSH manager. */
export declare const PLUGINS_CAPABILITY = "dsh.plugin-manager";
export interface PluginRequest {
    action: string;
    inputJson?: string;
}
export interface PluginError {
    code: string;
    message: string;
}
export type PluginResult = {
    ok: true;
    valueJson: string;
} | {
    ok: false;
    error: PluginError;
};
export interface PluginStatus {
    supported: boolean;
    protocolVersion: 1;
    capabilities: {
        toggle: boolean;
        config: boolean;
        install: boolean;
        pageConfig?: boolean;
    };
    reason?: string;
}
export interface PluginItem {
    id: string;
    kind: 'bundle' | 'plugin';
    name: string;
    title: string;
    description: string;
    category: 'official' | 'experimental' | 'third-party';
    enabled: boolean;
    version?: string;
    availability?: string;
    canToggle: boolean;
    canInstall: boolean;
    readOnlyReason?: string;
    revision: string;
    /** Additive catalog v2: official means a native built-in configuration card. */
    builtin?: boolean;
    iconKey?: 'subagent' | 'search' | 'loop' | 'terminal' | 'plugin';
    runtimeState?: 'pending' | 'loading' | 'active' | 'failed' | 'unloading';
}
export interface PluginField {
    path: string[];
    title: string;
    description?: string;
    type: 'string' | 'number' | 'boolean' | 'enum' | 'array';
    itemType?: 'string' | 'number' | 'boolean';
    value?: unknown;
    options?: {
        label: string;
        value: string | number | boolean | null;
    }[];
    secret?: boolean;
    configured?: boolean;
    required?: boolean;
    readOnly?: boolean;
    minimum?: number;
    maximum?: number;
}
export interface PluginSection {
    ns: string;
    title: string;
    revision: number;
    writable: boolean;
    customPage: boolean;
    fields: PluginField[];
    unsupported: {
        path: string[];
        title: string;
        reason: string;
    }[];
}
/** Optional, versioned presentation of an audited native configuration page. */
export interface PageField {
    ns: string;
    path: string[];
    title: string;
    group?: string;
    description?: string;
    help?: string;
    integer?: boolean;
    minimum?: number;
    maximum?: number;
    options?: {
        label: string;
        value: string | number | boolean | null;
    }[];
    visibleWhen?: {
        ns: string;
        path: string[];
        value: unknown;
    };
}
export interface PluginPresentation {
    version: 1;
    id: string;
    saveMode: 'page' | 'immediate' | 'none';
    fields: PageField[];
    notices?: string[];
    models?: {
        ns: string;
        path: string[];
        enabledPath: string[];
        status: 'ready' | 'error';
        partial: boolean;
        candidates: {
            key: string;
            provider: string;
            model: string;
            providerName: string;
            modelName: string;
            available: boolean;
            selected: boolean;
        }[];
    };
    credential?: {
        configured: boolean;
        writable: boolean;
        revision: string;
    };
    web?: {
        selectionNs: string;
        searchPath: string[];
        fetchPath: string[];
        useSearchApi: boolean;
        switchAvailable: boolean;
        apiValues: {
            searchProvider: string;
            fetchProvider: string;
        };
        messageValues: {
            searchProvider: string;
            fetchProvider: string;
        };
    };
    speech?: SpeechPresentation;
    cua?: {
        revision: string;
        persistent: boolean;
        writable: boolean;
        system?: {
            accessibility: boolean;
            screenRecording: boolean;
        };
        defaultPreset?: {
            isPtc: boolean;
            writable: boolean;
            revision: number;
        };
        applications?: {
            allowedApps: {
                id: string;
                name: string;
            }[];
            blockedApps: {
                id: string;
                name: string;
            }[];
            persistentAvailable: boolean;
        };
        canRevoke: boolean;
        canRetryApproval: boolean;
    };
}
export interface SpeechPresentation {
    revision: string;
    selection: {
        providerId: string;
        language: string;
    };
    canConfigure: boolean;
    canPrepare: boolean;
    canCancel: boolean;
    providers: {
        id: string;
        name: string;
        location: 'host-local' | 'cloud';
        languages: string[];
        downloadSources?: string[];
        setupEstimate?: {
            recommendedDiskBytes: number;
            expectedMemoryBytes: number;
            minimumMinutes: number;
            maximumMinutes: number;
        };
        preparation: {
            phase: string;
            completedBytes?: number;
            totalBytes?: number;
            startedAt?: number;
            steps?: {
                kind: string;
                status: string;
                startedAt?: number;
            }[];
        };
    }[];
}
