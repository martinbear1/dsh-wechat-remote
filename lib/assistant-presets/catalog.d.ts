import { type AssistantDefinition } from './definition.js';
export interface AssistantTemplate {
    id: string;
    name: string;
    description: string;
    definition: AssistantDefinition;
}
export declare function assistantTemplates(): AssistantTemplate[];
