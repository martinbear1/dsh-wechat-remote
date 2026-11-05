/** Build pinned upstream pure editor code. No Host/profile/data is read. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
const root = fileURLToPath(new URL('../', import.meta.url))
const dependencies = process.env.SCHEDULE_EDITOR_NODE_MODULES
if (!dependencies) throw Error('SCHEDULE_EDITOR_NODE_MODULES must contain the pinned editor dependencies')
const result = await build({ stdin: { contents: `export {taskDraft,newTaskDraft,taskDraftPatch,taskDraftIssue,draftTarget} from './draft.ts'; export {timingFromDraft,rruleFromDraft} from './editor-timing.ts';`,
  resolveDir:path.join(root,'THIRD-PARTY-NOTICES/schedule-editor'), sourcefile:'native-editor.ts', loader:'ts' },
  nodePaths:[dependencies], bundle:true, write:false, platform:'node', format:'esm', target:'node22', minify:true, legalComments:'inline' })
fs.writeFileSync(path.join(root,'src/scheduled-tasks/editor-native.ts'), '// @ts-nocheck\n// Generated from pinned MIT native editor sources. See THIRD-PARTY-NOTICES/schedule-editor.\n'+ result.outputFiles[0].text)
const records = await build({entryPoints:[path.join(root,'THIRD-PARTY-NOTICES/schedule-editor/task-record.ts')],bundle:true,write:false,platform:'node',format:'esm',target:'node22',minify:true})
fs.writeFileSync(path.join(root,'src/scheduled-tasks/record-native.ts'),'// @ts-nocheck\n// Pinned native task-record projections. See THIRD-PARTY-NOTICES/schedule-editor.\n'+records.outputFiles[0].text)
