import path from 'node:path';
import { dshProfileFacts } from '../dsh-host-context.js';
import { nodeStorageDirectory } from '../node-storage.js';
import { definitionDigest } from '../assistant-presets/definition.js';
import { resourceAssistant, resourceKey, resourcePresetId } from './contract.js';
import { ResourceStorage } from './storage.js';
export function resourceAssistantDefinition(resource) {
    const definition = resourceAssistant(resource);
    return definition ? { id: 'resource_' + resourceKey(resource), version: 1, digest: definitionDigest(definition),
        definition, presetId: resourcePresetId(resource), source: 'resource' } : undefined;
}
/** No native registry, network, profile edit or registration. Historic work
 * records remain readable while the resource component itself is disabled. */
export async function readResourceAssistantDefinitions(host, signal) {
    signal.throwIfAborted();
    let profile;
    try {
        profile = dshProfileFacts(host);
    }
    catch {
        return [];
    }
    if (!profile)
        return [];
    const storage = new ResourceStorage(path.join(nodeStorageDirectory(profile.home, profile.name), 'private-resources'));
    const saved = await storage.scan();
    signal.throwIfAborted();
    return saved.records.flatMap(({ resource }) => {
        const definition = resourceAssistantDefinition(resource);
        return definition ? [definition] : [];
    });
}
