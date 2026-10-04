import { type HumanTaskRef } from '../human-tools/protocol.js';
import { type WorkflowDataStore, type WorkflowScope } from './data.js';
import { WorkspaceAuthority, type WorkspaceRef } from './workspace-authority.js';
import { recipientFacts } from './recipient-facts.js';
type Member = ReturnType<typeof recipientFacts>['recipients'][number];
export interface WorkspaceSource {
    id: string;
    revision: number;
    sourceSurfaceId: string;
    origin: WorkflowScope;
    taskRef: HumanTaskRef;
    title: string;
    groupRef: string;
    snapshot: string;
    syncedAt: number;
    members: Member[];
}
interface NoteValue {
    displayName: string;
    aliases: string[];
    notes: string;
}
export interface WorkspaceTaskAccess {
    workspaceRef: WorkspaceRef;
    sourceScope: WorkflowScope;
}
export declare class WorkspaceDirectory {
    private readonly state;
    private readonly options;
    readonly authority: WorkspaceAuthority;
    private persisted;
    private constructor();
    static open(store: WorkflowDataStore, options: WorkspaceDirectory['options']): Promise<WorkspaceDirectory>;
    close(): Promise<void>;
    private authorRef;
    private partition;
    private source;
    private authorize;
    access(scope: WorkflowScope, taskRef: HumanTaskRef, signal: AbortSignal): Promise<WorkspaceTaskAccess | undefined>;
    resolveSource(scope: WorkflowScope, sourceId: string, signal: AbortSignal): Promise<{
        taskRef: HumanTaskRef;
        sourceScope: WorkflowScope;
        sourceSurfaceId: string;
        workspaceRef: WorkspaceRef;
        proof: import("./workspace-source.js").WorkspaceSourceProof;
    }>;
    private taskIdentity;
    sync(scope: WorkflowScope, input: {
        sourceSurfaceId?: string;
        workspaceSourceId?: string;
        expectedRevision: number;
    }, signal: AbortSignal): Promise<{
        schema: string;
        workspaceSourceId: string;
        revision: number;
        groupRef: string;
        taskRef: HumanTaskRef;
        knownMembers: number;
        asOf: number;
        completeGroupRoster: boolean;
    }>;
    query(scope: WorkflowScope, input: {
        workspaceSourceId?: string;
        groupRef?: string;
        offset?: number;
    }, signal: AbortSignal): Promise<{
        schema: string;
        revision: number;
        coverage: string;
        groups: {
            groupRef: string;
            note: {
                revision: number;
                value: NoteValue | null;
                authoredAt: number;
                authorRef: string;
                source: string;
                verifiedIdentity: boolean;
            } | {
                revision: number;
                value: null;
                authoredAt?: undefined;
                authorRef?: undefined;
                source?: undefined;
                verifiedIdentity?: undefined;
            };
            sources: {
                workspaceSourceId: string;
                revision: number;
                taskRef: HumanTaskRef;
                title: string;
                sourceAgentRef: string;
                groupRef: string;
                knownMembers: number;
                asOf: number;
            }[];
        }[];
        nextOffset: number | null;
        cached?: undefined;
        authorization?: undefined;
        completeGroupRoster?: undefined;
        sources?: undefined;
        members?: undefined;
    } | {
        schema: string;
        revision: number;
        cached: boolean;
        authorization: string;
        completeGroupRoster: boolean;
        sources: {
            workspaceSourceId: string;
            revision: number;
            taskRef: HumanTaskRef;
            title: string;
            sourceAgentRef: string;
            groupRef: string;
            knownMembers: number;
            asOf: number;
        }[];
        members: {
            note: {
                revision: number;
                value: NoteValue | null;
                authoredAt: number;
                authorRef: string;
                source: string;
                verifiedIdentity: boolean;
            } | {
                revision: number;
                value: null;
                authoredAt?: undefined;
                authorRef?: undefined;
                source?: undefined;
                verifiedIdentity?: undefined;
            };
            identity: Member["identity"];
            observations: {
                workspaceSourceId: string;
                asOf: number;
                recipient: Member;
            }[];
        }[];
        nextOffset: number | null;
        coverage?: undefined;
        groups?: undefined;
    }>;
    note(scope: WorkflowScope, input: {
        groupRef: string;
        memberRef: string | null;
        expectedRevision: number;
        value: NoteValue | null;
    }, signal: AbortSignal): Promise<{
        schema: string;
        revision: number;
        value: NoteValue | null;
        authoredAt: number;
        source: string;
        verifiedIdentity: boolean;
    }>;
}
export {};
