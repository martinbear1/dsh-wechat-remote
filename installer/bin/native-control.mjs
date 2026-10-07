/** Retired private lifecycle handshake. Keep denial entry points so stale
 * callers cannot edit native user patches or launch an automatic restart. */
import { legacyUpdateError } from '../lib/install-control.js'
export function attachControl() { throw legacyUpdateError() }
export async function waitForJson() { throw legacyUpdateError() }
export async function waitForInstallControl() { throw legacyUpdateError() }
export async function waitForWebIdle() { throw legacyUpdateError() }
