/** Public identity evidence, not a business filter or a native routing-ID export. */
import { humanRecipientRef, humanTaskRef, sameTaskRef, type HumanTaskRef } from '../human-tools/protocol.js'
import { bounded, copy, exact, fail, plain, revision, row } from './data.js'

const nullableTime = (value: unknown) => value === null || revision(value)
const nullableRef = (value: unknown) => value === null || typeof value === 'string' && /^[A-Za-z0-9_-]{24,64}(?![\s\S])/.test(value)
// Opaque 32-byte HMAC encodings, not native IDs, names or execution grants.
const identityRef = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048](?![\s\S])/.test(value)
export const recipientSnapshot = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}(?![\s\S])/.test(value)

export function recipientFacts(value: unknown, taskRef: HumanTaskRef, roundId: string | null, offset: number, snapshot?: string) {
  const invalid = () => fail('lifecycle-response-invalid', '成员事实响应与所查询的任务或范围不符')
  if (!row(value)) throw invalid()
  bounded(value, 64 * 1024)
  const coverage = value.coverage
  if (value.schema !== 'human.recipient.facts.v1' || !sameTaskRef(humanTaskRef(value.taskRef), taskRef)
    || value.roundId !== roundId || !revision(value.asOf) || !revision(value.revision) || !recipientSnapshot(value.snapshot)
    || snapshot !== undefined && snapshot !== value.snapshot
    || !row(coverage) || !exact(coverage, ['kind', 'completeGroupRoster', 'totalKnown', 'roundScoped', 'excludedOwner'])
    || coverage.kind !== 'known-task-members' || coverage.completeGroupRoster !== false || coverage.excludedOwner !== true
    || coverage.roundScoped !== (roundId !== null) || !revision(coverage.totalKnown)
    || !Array.isArray(value.recipients) || value.recipients.length > 20
    || value.recipients.length !== Math.min(20, Math.max(0, coverage.totalKnown - offset))
    || value.nextOffset !== (coverage.totalKnown > offset + 20 ? offset + 20 : null)) throw invalid()
  const seen = new Set<string>()
  let groupRef: string | undefined
  const recipients = value.recipients.map(item => {
    if (!row(item) || !exact(item, ['identity', 'recipientRef', 'participantRef', 'sources', 'observedAt', 'confirmedAt', 'identityVerifiedAt', 'canTarget', 'unavailableReason', 'submissionFacts'])) throw invalid()
    const identity = item.identity
    if (!row(identity) || !exact(identity, ['schema', 'groupRef', 'memberRef']) || identity.schema !== 'human.member.identity.v1'
      || !identityRef(identity.groupRef) || !identityRef(identity.memberRef)
      || groupRef !== undefined && groupRef !== identity.groupRef || seen.has(`identity:${identity.memberRef}`)) throw invalid()
    groupRef = identity.groupRef; seen.add(`identity:${identity.memberRef}`)
    const ref = humanRecipientRef(item.recipientRef)
    if (!ref || ref.taskId !== taskRef.taskId || ref.deliveryId !== taskRef.deliveryId || !nullableRef(item.participantRef)
      || !Array.isArray(item.sources) || !item.sources.length || new Set(item.sources).size !== item.sources.length
      || !item.sources.every(source => ['observed', 'selection', 'audience'].includes(String(source))) || !item.sources.includes(ref.source)
      || ![item.observedAt, item.confirmedAt, item.identityVerifiedAt].every(nullableTime)
      || typeof item.canTarget !== 'boolean'
      || (item.canTarget ? item.unavailableReason !== null : !['group-identity-unverified', 'route-unavailable', 'outside-task-audience'].includes(String(item.unavailableReason)))) throw invalid()
    if (item.participantRef === null && (item.observedAt !== null || item.confirmedAt !== null || item.identityVerifiedAt !== null || item.sources.includes('observed'))
      || ref.source === 'observed' && ref.ref !== item.participantRef) throw invalid()
    const key = JSON.stringify(ref), participantKey = item.participantRef === null ? null : `participant:${item.participantRef}`
    if (seen.has(key) || participantKey !== null && seen.has(participantKey)) throw invalid()
    seen.add(key); if (participantKey !== null) seen.add(participantKey)
    const facts = item.submissionFacts
    if (roundId === null ? facts !== null : !row(facts)
      || !exact(facts, ['acceptedCount', 'latestSubmissionId', 'acceptedAt', 'receivedAt']) || !revision(facts.acceptedCount)
      || ![facts.acceptedAt, facts.receivedAt].every(nullableTime)
      || (facts.acceptedCount === 0 ? facts.latestSubmissionId !== null || facts.acceptedAt !== null || facts.receivedAt !== null
        : !plain(facts.latestSubmissionId, 128) || facts.acceptedAt === null || item.participantRef === null)) throw invalid()
    // Select fields rather than forwarding future server fields, native IDs or credentials.
    return { identity: { schema: 'human.member.identity.v1' as const, groupRef: identity.groupRef, memberRef: identity.memberRef },
      recipientRef: ref, participantRef: item.participantRef, sources: [...item.sources], observedAt: item.observedAt,
      confirmedAt: item.confirmedAt, identityVerifiedAt: item.identityVerifiedAt, canTarget: item.canTarget,
      unavailableReason: item.unavailableReason, submissionFacts: copy(facts) }
  })
  return { schema: 'human.recipient.facts.v1', taskRef: copy(taskRef), roundId, asOf: value.asOf, revision: value.revision,
    snapshot: value.snapshot, nextOffset: value.nextOffset, coverage: copy(coverage), recipients }
}
