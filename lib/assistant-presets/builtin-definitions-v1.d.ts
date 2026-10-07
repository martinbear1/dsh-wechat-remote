import { type AssistantDefinition } from './definition.js';
/** Immutable v1 catalog snapshot: persisted work records refer to its digest.
 * Future built-in revisions must add another snapshot; never edit this one. */
declare const definitions: {
    designer: {
        schemaVersion: number;
        name: string;
        description: string;
        role: string;
        basePreset: string;
        methods: string[];
        onboarding: {
            key: string;
            label: string;
            prompt: string;
        }[];
        skills: string[];
    };
    teacher: {
        schemaVersion: number;
        name: string;
        description: string;
        role: string;
        basePreset: string;
        methods: string[];
        onboarding: {
            key: string;
            label: string;
            prompt: string;
        }[];
        skills: string[];
    };
    project: {
        schemaVersion: number;
        name: string;
        description: string;
        role: string;
        basePreset: string;
        methods: string[];
        onboarding: {
            key: string;
            label: string;
            prompt: string;
        }[];
        skills: string[];
    };
};
export declare function builtinDefinitionV1(templateId: keyof typeof definitions): AssistantDefinition;
export {};
