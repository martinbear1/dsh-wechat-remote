import fs from 'node:fs'
import path from 'node:path'
import { parseDocument, isSeq, isMap } from 'yaml'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const digest = value => createHash('sha256').update(value).digest('hex')
function document(text) {
  const doc = parseDocument(text, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] })
  if (doc.errors.length || !isSeq(doc.contents)) throw new Error('DSH 配置不是有效的原生插件列表，未修改配置。')
  return doc
}
/** Native user-patch insertion; remove only our entry and retain concurrent edits. */
export function attachControl(profile, helper, config) {
  const filename = path.join(profile, 'cordis.patch.yml')
  const original = fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : '[]\n'
  const doc = document(original), id = 'wechat-installer-' + path.basename(config.directory)
  doc.contents.flow = false
  doc.contents.add(doc.createNode({ insert: [{ id, name: pathToFileURL(helper).href, config }] }))
  const patched = String(doc)
  fs.writeFileSync(path.join(config.directory, 'user-patch-before.yml'), original, { mode: 0o600, flag: 'wx' })
  fs.writeFileSync(filename, patched)
  return () => {
    const current = fs.readFileSync(filename, 'utf8')
    if (digest(current) === digest(patched)) { fs.writeFileSync(filename, original); return }
    const latest = document(current)
    latest.contents.items = latest.contents.items.filter(item => {
      if (!isMap(item)) return true
      const entries = item.get('insert', true)
      if (!isSeq(entries)) return true
      entries.items = entries.items.filter(entry => !isMap(entry) || entry.get('id') !== id)
      return entries.items.length > 0 || item.items.length !== 1
    })
    fs.writeFileSync(filename, String(latest))
  }
}

export async function waitForJson(filename, accept, timeout = 20000) {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    try { const value = JSON.parse(fs.readFileSync(filename, 'utf8')); if (accept(value)) return value } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('DSH 没有完成安装握手；原插件未替换。请确认 DSH WebUI 正在运行且允许原生插件热加载。')
}
