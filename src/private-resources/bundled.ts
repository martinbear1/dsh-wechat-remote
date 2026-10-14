import chatMode from './bundled/chat-mode.json' with { type: 'json' }
import { parseResourcePreset, resourceSha256 } from './contract.js'

/** The first public resource release is shipped as data for offline first use.
 * Cloud publication uses these same canonical bytes; there is no second preset
 * registration or startup download path. Never replace an existing local ID. */
export function bundledResourceReleases() {
  const content = Buffer.from(JSON.stringify(chatMode))
  const resource = parseResourcePreset(content)
  return [{ content, release: { resourceId: resource.resourceId, version: resource.version,
    sha256: resourceSha256(content), bytes: content.length } }]
}
