// Pure native editor functions, without React UI. See provenance.json.
import { Cron, RRule } from './index.ts'
import { defaultTiming, timingFromDraft, timingFromRecord } from './editor-timing.ts'
export interface TaskEditorDraft extends TimingDraft {
  readonly title: string
  readonly prompt: string
  readonly target: 'session' | 'new_once' | 'new'
  readonly sessionId: string
  readonly cwd: string
}

/** Registered Workspaces offered as the directory of a created Session. */
interface ProjectChoices {
  readonly items: readonly { readonly value: string; readonly label: string }[]
  /** Directory a new destination starts with: the default Workspace, else the first listed one, else empty. */
  readonly defaultCwd: string
}

/** Label Workspaces as the Workspace list does and select the directory a new destination starts with. */
export function projectChoices(workspaces: WorkspaceSnapshot['items'], defaultName: string): ProjectChoices {
  return {
    items: workspaces.map(workspace => ({ value: workspace.path, label: workspaceDisplayTitle(workspace.title, defaultName) })),
    defaultCwd: (workspaces.find(workspace => workspace.title === DEFAULT_WORKSPACE_DIRECTORY) ?? workspaces[0])?.path ?? '',
  }
}

/** Initialize a new task without creating or activating a Session. */
export function newTaskDraft(): TaskEditorDraft {
  return { ...defaultTiming(), title: '', prompt: '', target: 'new_once', sessionId: '', cwd: '' }
}

/** Seed an edit without normalizing unsupported stored rules. */
export function taskDraft(task: ScheduleCatalogEntry): TaskEditorDraft {
  return {
    ...timingFromRecord(task), title: task.title, prompt: task.prompt,
    target: task.target.kind, sessionId: task.target.kind === 'session' ? task.target.sessionId : '',
    cwd: task.target.kind === 'session' ? '' : task.target.create.cwd ?? '',
  }
}

/**
 * Validate the form while retaining untouched stored timing.
 * @param draft - Current form values.
 * @param changes - Existing task patch; omitted validates a new timing as well.
 * @returns First correction key, `incomplete` for missing required fields, or undefined when valid.
 */
export function taskDraftIssue(draft: TaskEditorDraft, changes?: SchedulePatch): TaskManagerKey | 'incomplete' | undefined {
  if (draft.title.trim() === '' || draft.prompt.trim() === '' || draft.target === 'session' && draft.sessionId === '') return 'incomplete'
  if (draft.title.trim().length > 120) return 'rule.invalidTitle'
  if (draft.frequency !== 'once' && draft.frequency !== 'advanced'
    && (!/^[1-9]\d*$/.test(draft.interval) || !Number.isSafeInteger(Number(draft.interval)))) return 'rule.invalidInterval'
  if (draft.frequency === 'weekly' && draft.weekdays.length === 0) return 'rule.requiredWeekday'
  if (draft.frequency === 'monthly' && (!Number.isInteger(draft.monthDay) || draft.monthDay < 1 || draft.monthDay > 31)) return 'rule.invalidMonthDay'
  if (draft.frequency === 'daily' && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.dailyTime)) return 'rule.invalidTime'
  // An untouched stored rule remains authoritative for a content-only edit.
  if (changes !== undefined && changes.timing === undefined) return undefined
  const timing = timingFromDraft(draft, true)
  const parsed = timing.kind === 'cron' ? Cron.parse(timing.cron.expression, timing.cron.time_zone)
    : timing.kind === 'rrule' ? RRule.parse(timing.rrule, { rejectIneffectiveSetPositions: true }) : undefined
  if (parsed?.kind !== 'rejected') return undefined
  if (parsed.reason === 'time_zone') return 'rule.invalidZone'
  if (parsed.reason === 'density') return 'rule.tooComplex'
  return draft.frequency === 'advanced' ? 'rule.invalid' : 'rule.invalidTime'
}

/** Only meaningful field changes enter the CAS edit; untouched timing is never rewritten. */
export function taskDraftPatch(draft: TaskEditorDraft, original: ScheduleCatalogEntry, intervalFromNow = false): SchedulePatch {
  const seeded = taskDraft(original)
  const timingChanged = JSON.stringify(timingFromDraft(draft)) !== JSON.stringify(timingFromDraft(seeded))
  const targetChanged = draft.target !== seeded.target || draft.sessionId !== seeded.sessionId || draft.cwd !== seeded.cwd
  return {
    ...(draft.title.trim() === seeded.title.trim() ? {} : { title: draft.title.trim() }),
    ...(draft.prompt.trim() === seeded.prompt.trim() ? {} : { prompt: draft.prompt.trim() }),
    ...(timingChanged ? { timing: timingFromDraft(draft, intervalFromNow) } : {}),
    ...(targetChanged ? { target: draftTarget(draft, original) } : {}),
  }
}

/** Reapply changed field groups only after the user chooses to review a newer revision. */
export function reapplyTaskDraft(draft: TaskEditorDraft, latest: ScheduleCatalogEntry, changes: SchedulePatch): TaskEditorDraft {
  const { title, prompt, target, sessionId, cwd, ...timing } = draft
  const { title: latestTitle, prompt: latestPrompt, target: latestTarget,
    sessionId: latestSessionId, cwd: latestCwd, ...latestTiming } = taskDraft(latest)
  return {
    ...(changes.timing === undefined ? latestTiming : timing),
    title: changes.title === undefined ? latestTitle : title,
    prompt: changes.prompt === undefined ? latestPrompt : prompt,
    ...(changes.target === undefined ? { target: latestTarget, sessionId: latestSessionId, cwd: latestCwd } : { target, sessionId, cwd }),
  }
}

/** Resolve the explicit destination, preserving an existing preset when the project is unchanged. */
export function draftTarget(draft: TaskEditorDraft, original?: ScheduleCatalogEntry): ScheduleTargetRequest {
  if (draft.target === 'session') return { kind: 'session', sessionId: draft.sessionId as SessionId }
  const previous = original?.target.kind === 'session' ? undefined : original?.target.create
  const create = {
    ...(draft.cwd === '' ? {} : { cwd: draft.cwd }),
    ...((previous?.cwd ?? '') === draft.cwd && previous?.agentPreset !== undefined ? { agentPreset: previous.agentPreset } : {}),
  }
  return { kind: draft.target, create }
}
