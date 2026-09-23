/** Generated-manifest compatibility only. Retire with pre-0.1.6-alpha.2 hosts.
 * New hosts keep lazy factories; old hosts read the SAME strict schema through
 * a lazy accessor. No relaxed validation or second schema copy. */
export function attachLegacySchemaAccess(manifest: any): void {
  const expose = (codec: any) => {
    if (!codec || typeof codec.create !== 'function' || 'schema' in codec) return
    Object.defineProperty(codec, 'schema', { enumerable: true, get: () => codec.create() })
  }
  for (const schema of manifest.schemas) expose(schema)
  for (const invocation of manifest.invocations) {
    expose(invocation.receiver?.codec)
    for (const parameter of invocation.parameters) expose(parameter.codec)
    expose(invocation.result)
  }
}
