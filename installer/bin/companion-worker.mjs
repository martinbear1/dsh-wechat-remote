/** Historical CLI Web cross-host worker. Native PluginManager updates remain
 * in the owning application; this entry must never launch a CLI transaction. */
import { legacyUpdateError } from '../lib/install-control.js'
console.error(legacyUpdateError().message)
process.exitCode = 1
if (process.connected) process.disconnect()
