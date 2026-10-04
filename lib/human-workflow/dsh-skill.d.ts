import type { Context } from '@deepseek-ai/cordis';
export declare const HUMAN_WORKFLOW_SKILL_REVISION = "2026-10-04-composable-targets-v1";
/** Trusted package instructions, not generated executable code. Profession
 * templates may reference this skill; task data never rewrites its protocol. */
export declare const HUMAN_WORKFLOW_SKILL: {
    name: string;
    description: string;
    whenToUse: string;
    source: string;
    provider: string;
    invocation: {
        modelInvocable: boolean;
        userInvocable: boolean;
    };
    content: string;
};
/** Older hosts without the native skill seam retain the typed tools. Do not
 * invent filesystem roots or install another skill implementation for them. */
export declare function registerHumanWorkflowSkill(host: Context): (() => void) | undefined;
