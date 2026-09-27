// Spawned only by an explicitly installed native bundle for an existing Web
// owner. No shell, no Desktop profile and no recursive companion invocation.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { install } from './setup.mjs'
import { companionTarget, validateCompanionOffer } from '../lib/companion-updates.js'
import { compareVersions } from '../lib/update-policy.js'
const root = fileURLToPath(new URL('../', import.meta.url))
const [home, version, previous, offerId] = process.argv.slice(2)
try {
  if (!home || !path.isAbsolute(home) || fs.realpathSync(home) !== path.normalize(home)) throw Error('DSH 数据目录不明确')
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const offer = JSON.parse(fs.readFileSync(path.join(home, 'harness-remote/installation-offers/web.json'), 'utf8'))
  if (!offerId || offer.id !== offerId || offer.version !== version || offer.previous !== previous
    || fs.realpathSync(offer.source) !== fs.realpathSync(root)) throw Error('联动更新请求或来源已变化，未执行旧请求')
  const assertTarget = () => {
    const current = validateCompanionOffer(home, 'web', offer)
    if (current?.owner !== 'cli' || ![previous, version].includes(current.version)) throw Error('Web 安装归属或版本已变化，未覆盖')
  }
  const target = companionTarget(home, 'web')
  assertTarget()
  if (manifest.name !== 'dsh-wechat-remote' || manifest.version !== version || target?.owner !== 'cli'
      || ![previous, version].includes(target.version)) throw Error('Web 安装归属或版本已变化，未覆盖')
  if (compareVersions(version, target.version) > 0) {
    const result = await install({ home, profileName: 'web', open: false, startAfterInstall: false, companion: false, bundledOnly: true,
      deferBusy: true, assertTarget, onBusy: () => process.send?.({ type: 'companion-busy' }) })
    if (result.version !== version) throw Error('Web 安装版本需要单独核对')
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = error.code === 'DSH_COMPANION_BUSY' ? 75 : 1
}
finally { if (process.connected) process.disconnect() }
