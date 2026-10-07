import type { Context } from '@deepseek-ai/cordis';
export declare const HUMAN_WORKFLOW_SKILL_REVISION = "2026-10-07-collaboration-guidance-v11";
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
/** Report missing native skill support to the composing component. It must
 * not advertise tools without their usage contract or invent skill roots. */
export declare function registerHumanWorkflowSkill(host: Context): (() => void) | undefined;
