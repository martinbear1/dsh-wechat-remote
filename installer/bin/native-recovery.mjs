/** Historical live rollback is retired. Never edit a user patch or restart
 * a native host from an old recovery request; preserve its records untouched. */
import { legacyUpdateError } from '../lib/install-control.js'
export async function verifyNativeRestore() { throw legacyUpdateError() }
