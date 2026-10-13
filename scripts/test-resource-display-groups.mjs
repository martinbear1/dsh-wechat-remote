/** Pure presentation facts only: no host, network, filesystem resource or profile operation. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const compiled = await build({ entryPoints: [fileURLToPath(new URL('../src/client/my-resources-store.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm' })
const { groupResources, compareResourceVersions, isLocalResource } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'))
const item = (version, extra = {}) => Object.freeze({ resourceId: 'story', version, name: '故事伙伴', description: '', state: 'available', ...extra })
const installed = (version, extra = {}) => item(version, { state: 'installed', presetId: `story-${version}`, enabled: true, ...extra })

test('resource identity, not name or release count, decides the number of cards', () => {
  const rows = Object.freeze([installed('1.0.0'), installed('1.1.0', { name: '故事伙伴新版', enabled: false }), item('1.2.0'),
    item('1.0.0', { resourceId: 'other' }), item('2.0.0', { resourceId: 'other' })])
  const before = JSON.stringify(rows), grouped = groupResources(rows)
  assert.equal(grouped.local.length, 1); assert.equal(grouped.delivery.length, 1)
  assert.equal(grouped.local[0].primary.version, '1.1.0'); assert.equal(grouped.local[0].primary.enabled, false)
  assert.equal(grouped.local[0].local[1].enabled, true, 'grouping never disables an older version')
  assert.equal(grouped.local[0].update.version, '1.2.0'); assert.equal(grouped.delivery[0].primary.version, '2.0.0')
  assert.equal(JSON.stringify(rows), before, 'sorting cannot mutate the supplied snapshot')
})

test('version order is semantic, including arbitrarily large numbers and prereleases', () => {
  const ascending = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta.2', '1.0.0-beta.11',
    '1.0.0-rc.1', '1.0.0', '1.9.0', '1.10.0', '999999999999999999.0.0', '1000000000000000000.0.0']
  const grouped = groupResources(ascending.map(version => item(version)))
  assert.deepEqual(grouped.delivery[0].delivery.map(row => row.version), [...ascending].reverse())
  for (const [index, version] of ascending.entries()) {
    assert.equal(compareResourceVersions(version, version), 0)
    if (index) { assert(compareResourceVersions(ascending[index - 1], version) < 0); assert(compareResourceVersions(version, ascending[index - 1]) > 0) }
  }
})

test('malformed version labels are retained but cannot claim an upgrade', () => {
  for (const invalid of ['v1.0.0', '01.0.0', '1.0.0-01', '1.0.0+build', '*', '']) {
    assert.equal(compareResourceVersions(invalid, '1.0.0'), null)
    const grouped = groupResources([installed('1.0.0'), item(invalid)])
    assert.equal(grouped.local[0].update, undefined)
    assert.equal(grouped.local[0].delivery[0].version, invalid)
    assert.equal(groupResources([item(invalid), item('1.0.0')]).delivery[0].primary.version, '1.0.0')
  }
})

test('cloud releases below the latest local version are not promoted as updates', () => {
  const grouped = groupResources([installed('1.0.0'), item('1.1.0'), installed('1.2.0', { enabled: false })])
  assert.equal(grouped.local[0].update, undefined)
  assert.equal(grouped.local[0].delivery[0].version, '1.1.0')
  assert.equal(grouped.local[0].primary.version, '1.2.0')
})

test('unavailable native activations remain local facts and retain their exact controls', () => {
  const broken = item('1.1.0', { state: 'unavailable', presetId: 'broken', enabled: true })
  const grouped = groupResources([installed('1.0.0'), broken, item('1.2.0')])
  assert.equal(grouped.local[0].primary, broken); assert.equal(grouped.local[0].update.version, '1.2.0')
  assert(isLocalResource(item('1.0.0', { state: 'unavailable', presetId: 'only-id' })))
  assert(isLocalResource(item('1.0.0', { state: 'unavailable', enabled: false })))
  assert(!isLocalResource(item('1.0.0', { installedVersion: '0.9.0' })), 'a remote display hint is not installation proof')
})

test('failed or pending remote versions stay visible without misreporting installation', () => {
  for (const state of ['unavailable', 'installing']) {
    const grouped = groupResources([item('1.1.0', { state }), item('1.0.0')])
    assert.equal(grouped.local.length, 0); assert.equal(grouped.delivery[0].primary.state, state)
  }
  assert.deepEqual(groupResources([]), { local: [], delivery: [] })
})
