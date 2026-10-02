import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { CardCoverAssets } from './card-cover-assets.js';
export declare function cardCoverTool(nodeId: string, assets: CardCoverAssets, assertAgent: (exec: ToolRunContext) => void): ToolDefinition;
