import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { agentDshHome, agentProfileScope } from './agent-metadata.js';
import { nodeStorageDirectory } from './node-storage.js';
import { writePrivateJsonAtomic } from './secure-file.js';
import { hostFeatureAccess } from './feature-access.js';
import { BUILTIN_ASSISTANTS } from './assistant-presets/builtins.js';
import { BuiltinAssistantComponent } from './assistant-presets/builtin-component.js';
export const name = 'wechat-group-assistants';
export const inject = ['agentPresets', 'loader', 'profileContext', 'wechatFeatures'];
const preferences = (enabled) => ({ teacher: enabled, project: enabled, designer: enabled });
const validTemplate = (value) => BUILTIN_ASSISTANTS.some(item => item.templateId === value);
/** Only three local booleans, never a native profile/Agent/default-preset edit.
 * Separate from node opt-in: entitlement loss, the top switch and component
 * hot unload must not silently reset individual choices. */
export class GroupAssistantPreferences {
    file;
    enabled = preferences(true);
    issue = '';
    constructor(file) {
        this.file = file;
        try {
            if (statSync(file).size > 4096)
                throw new Error('oversized assistant preferences');
            const value = JSON.parse(readFileSync(file, 'utf8'));
            if (value?.schemaVersion !== 1 || !value.enabled || BUILTIN_ASSISTANTS.some(item => typeof value.enabled[item.templateId] !== 'boolean'))
                throw new Error('invalid assistant preferences');
            this.enabled = Object.fromEntries(BUILTIN_ASSISTANTS.map(item => [item.templateId, value.enabled[item.templateId]]));
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return;
            this.enabled = preferences(false);
            this.issue = '助手启停偏好未能读取，请重新选择要启用的助手；已有会话和资料保留。';
        }
    }
    get(templateId) { return this.enabled[templateId]; }
    get notice() { return this.issue; }
    set(templateId, enabled) {
        if (!validTemplate(templateId) || typeof enabled !== 'boolean')
            throw new Error('助手启停参数无效。');
        if (this.enabled[templateId] === enabled && !this.issue)
            return;
        const next = { ...this.enabled, [templateId]: enabled };
        // Commit before changing the observed state; failed writes never claim success.
        writePrivateJsonAtomic(this.file, { schemaVersion: 1, enabled: next });
        this.enabled = next;
        this.issue = '';
    }
}
/** One native component owns the three stable preset declarations. Their old
 * status services remain available to the existing catalog/phone contract. */
export class GroupAssistantsController {
    host;
    preferences;
    components;
    closed = false;
    closing;
    get active() { return !this.closed; }
    constructor(host, preferenceFile) {
        this.host = host;
        if (host.get('wechatGroupAssistants')?.active)
            throw new Error('群协作组件已运行。');
        this.preferences = new GroupAssistantPreferences(preferenceFile);
        this.components = [];
        try {
            for (const item of BUILTIN_ASSISTANTS)
                this.components.push(new BuiltinAssistantComponent(host, item.templateId, {
                    managed: true, enabled: () => this.preferences.get(item.templateId), reason: () => this.preferences.notice,
                }));
            host.provide('wechatGroupAssistants', this);
            host.effect(() => () => this.close(), 'Group assistant presets');
        }
        catch (error) {
            this.closed = true;
            void Promise.allSettled(this.components.map(component => component.close()));
            throw error;
        }
        // Publish presence before notifying the effective gate. Never await global
        // Loader readiness from native component activation itself.
        this.componentsChanged();
        void this.notify();
        // A physical component may have stayed off past the cached lease. Resume
        // the existing demand-driven gate once, without blocking native activation.
        void Promise.resolve().then(() => {
            if (!this.closed)
                return hostFeatureAccess(this.host).refresh();
        }).catch(() => { });
    }
    componentsChanged() {
        try {
            hostFeatureAccess(this.host).componentsChanged();
        }
        catch { /* backend may already have stopped */ }
    }
    notify() {
        if (this.closed)
            return this.closing || Promise.resolve();
        return Promise.all(this.components.map(component => component.notify())).then(() => { });
    }
    async setEnabled(templateId, enabled, signal) {
        signal?.throwIfAborted();
        if (this.closed)
            throw new Error('群协作组件已停用。');
        if (!validTemplate(templateId) || typeof enabled !== 'boolean')
            throw new Error('助手启停参数无效。');
        // This is also enforced by the authenticated feature-control endpoint.
        // Turning one card on never turns on the node or bypasses its entitlement.
        if (enabled)
            hostFeatureAccess(this.host).assertCurrent('group_assistant');
        this.preferences.set(templateId, enabled);
        await this.notify();
        signal?.throwIfAborted();
    }
    close() {
        if (this.closing)
            return this.closing;
        this.closed = true;
        this.componentsChanged();
        return this.closing = Promise.all(this.components.map(component => component.close())).then(() => { });
    }
}
export function apply(ctx) {
    new GroupAssistantsController(ctx, path.join(nodeStorageDirectory(agentDshHome(ctx), agentProfileScope(ctx)), 'group-assistant-preferences-v1.json'));
}
