/** Synthetic authority for unrelated unit/native-contract fixtures only.
 * Real lease validation, denial and revocation are tested separately. */
export function allowedFeatureFixture() {
  return { access: { async assert() {}, assertCurrent() {}, async refresh() {}, subscribe() { return () => {} },
    groupEnabled() { return true }, grant() { return { allowed: true, reason: 'allowed', validUntil: Number.MAX_SAFE_INTEGER, message: '' } } } }
}
