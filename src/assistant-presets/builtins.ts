import { builtinDefinitionV1 } from './builtin-definitions-v1.js'
import { definitionDigest, type AssistantDefinition } from './definition.js'

/** Product-owned identities. Never derived from a customer's install/session IDs.
 * A later definition revision must retain the preceding version for old records. */
export const BUILTIN_ASSISTANTS = [
  { templateId: 'teacher', presetId: 'harness-teacher', service: 'harnessTeacherAssistant', name: '教师助理' },
  { templateId: 'project', presetId: 'harness-project', service: 'harnessProjectAssistant', name: '项目助理' },
  { templateId: 'designer', presetId: 'harness-customizer', service: 'harnessCustomizerAssistant', name: '定制助手' },
] as const
export type BuiltinTemplateId = typeof BUILTIN_ASSISTANTS[number]['templateId']
export interface BuiltinAssistant {
  id: string; version: number; digest: string; templateId: BuiltinTemplateId; presetId: string
  name: string; definition: AssistantDefinition; sourceTemplateDigest: string
}
export interface BuiltinAssistantStatus extends BuiltinAssistant {
  state: 'installed' | 'unknown'; nativeState: 'installed' | 'disabled' | 'stale' | 'unknown'
  reason?: string; source: 'builtin'
}
export function builtinAssistants(): BuiltinAssistant[] {
  return BUILTIN_ASSISTANTS.map(item => {
    const source = builtinDefinitionV1(item.templateId)
    const definition = { ...source, name: item.name }
    return { id: `builtin_${item.templateId}`, version: 1, digest: definitionDigest(definition), templateId: item.templateId,
      presetId: item.presetId, name: item.name, definition, sourceTemplateDigest: definitionDigest(source) }
  })
}
export const builtinAssistant = (id: string, version: number) => builtinAssistants().find(item => item.id === id && item.version === version)
