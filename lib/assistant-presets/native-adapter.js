/** Native contract: deepseek-harness tag dsh-v0.2.0-rc.1, packages/preset/
 * agent-preset-registry and packages/boot/plugin-manager. The registry README
 * specifies bundle insert + public plugin manager, not old directory copy.
 * Only our new source package is authored here; native profile configuration
 * is exclusively written by the public native manager. */
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { lstat, mkdir, open, readFile, readdir, realpath, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assistantDefinition, assistantGuidance } from './definition.js';
const isRow = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
/** Only errors constructed here have wording safe for catalog projection.
 * Native fs/module/service failures may contain private host paths or config. */
class NativeAdapterError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
const error = (code, message) => new NativeAdapterError(code, message);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const idValid = (value) => typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}(?![\s\S])/.test(value);
const noSignal = new AbortController().signal;
const moduleName = '@deepseek-ai/dsh-agent-preset';
const personaName = '@deepseek-ai/dsh-persona';
const artifactRoot = 'assistant-native-bundles';
const boundedText = (value, bytes) => typeof value === 'string' && Buffer.byteLength(value) <= bytes;
function plainTree(value, depth = 0, budget = { count: 0 }, ancestors = new Set()) {
    if (++budget.count > 12_000 || depth > 24)
        throw error('assistant-base-unsupported', '基础预设结构过大或过深');
    if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value !== 'object' || !value || ancestors.has(value))
        throw error('assistant-base-unsupported', '基础预设不是有界声明数据');
    if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
        throw error('assistant-base-unsupported', '基础预设含不支持的 YAML 类型');
    ancestors.add(value);
    const result = Array.isArray(value) ? value.map(item => plainTree(item, depth + 1, budget, ancestors))
        : Object.fromEntries(Object.keys(value).sort().map(key => {
            if (['__proto__', 'constructor', 'prototype'].includes(key))
                throw error('assistant-base-unsupported', '基础预设含保留字段');
            return [key, plainTree(value[key], depth + 1, budget, ancestors)];
        }));
    ancestors.delete(value);
    return result;
}
const canonical = (value) => JSON.stringify(plainTree(value));
function rows(value) {
    const parsed = plainTree(value);
    if (!Array.isArray(parsed) || parsed.length > 128)
        throw error('assistant-base-unsupported', '基础预设必须是有界插件声明列表');
    const seen = new Set();
    for (const item of parsed) {
        if (!isRow(item) || typeof item.name !== 'string' || !/^(?:@[a-z0-9-]+\/[a-z0-9._/-]+|[a-z0-9][a-z0-9._/-]*|cordis:group)$/.test(item.name)
            || item.name.startsWith('.') || item.name.includes('..') || item.name.startsWith('/')
            || typeof item.id !== 'string' || !item.id || seen.has(item.id))
            throw error('assistant-base-unsupported', '基础预设含相对模块、重复 ID 或不支持的声明');
        seen.add(item.id);
        if (item.group === true)
            rows(item.config);
    }
    return parsed;
}
function parseBase(codec, document, expected) {
    if (!isRow(document) || document.agentPreset !== expected || !boundedText(document.content, 256 * 1024))
        throw error('assistant-base-unsupported', '原生基础预设读取结果无效');
    // readDocument uses dump(noRefs:true). Refuse alias/anchor tokens before
    // parsing anyway, instead of allowing an alias graph to amplify work.
    if (/(?:^|[\s,[{])(?:&|\*)[A-Za-z0-9_-]+/m.test(document.content))
        throw error('assistant-base-unsupported', '基础预设包含不支持的 YAML 引用');
    const parsed = rows(codec.load(document.content));
    if (Buffer.byteLength(canonical(parsed)) > 256 * 1024)
        throw error('assistant-base-unsupported', '基础预设声明过大');
    return parsed;
}
function transform(base, definition) {
    const result = rows(base);
    const personas = [];
    function scan(list, nested) {
        for (const row of list) {
            if (row.name === personaName) {
                if (nested)
                    throw error('assistant-base-unsupported', '嵌套 persona 不能安全派生职业预设');
                personas.push(row);
            }
            if (row.group === true)
                scan(row.config, true);
        }
    }
    scan(result, false);
    if (personas.length !== 1)
        throw error('assistant-base-unsupported', '基础预设必须含一个明确的原生 persona');
    const persona = personas[0], config = persona.config;
    if (!isRow(config) || typeof config.prefix !== 'string' || config.suffix !== undefined && typeof config.suffix !== 'string'
        || config.complete === true || config.includeRuntimeContext === false || persona.disabled !== undefined && persona.disabled !== false)
        throw error('assistant-base-unsupported', '基础 persona 不能隐藏原生规则或运行上下文');
    persona.config = { ...config, prefix: `${config.prefix}\n\n${assistantGuidance(definition)}`, complete: false, includeRuntimeContext: true };
    return result;
}
function manifest(preview) {
    return JSON.stringify({ name: preview.bundleName, version: '1.0.0', private: true, type: 'module',
        description: preview.definition.description, dsh: { bundle: { patch: './cordis.patch.yml' } } }, null, 2) + '\n';
}
/** Validate a persisted plan before a core accepts it from its local ledger.
 * This is structural integrity, NOT owner approval or proof that the inherited
 * composition is still current. install additionally rebuilds from the native
 * registry; the caller still owns signed/expiring explicit approval. */
export function validateNativeAssistantPreview(value) {
    const invalid = () => error('assistant-native-preview-invalid', '原生安装预览无效或内容已变化');
    const keys = ['schema', 'presetId', 'basePreset', 'bundleName', 'rowId', 'definition', 'baseDigest', 'patchDigest', 'patch', 'profileFingerprint', 'defaultPreset', 'warnings'];
    if (!isRow(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))
        || value.schema !== 'assistant.native.preview.v1' || !idValid(value.presetId)
        || value.rowId !== `harness-assistant-${value.presetId}` || value.bundleName !== `@harness-remote-assistants/${value.presetId}`
        || !boundedText(value.patch, 384 * 1024) || digest(value.patch) !== value.patchDigest
        || typeof value.baseDigest !== 'string' || !/^[a-f0-9]{64}(?![\s\S])/.test(value.baseDigest)
        || typeof value.profileFingerprint !== 'string' || !/^[a-f0-9]{64}(?![\s\S])/.test(value.profileFingerprint)
        || typeof value.defaultPreset !== 'string' || !value.defaultPreset || value.defaultPreset.length > 128
        || !Array.isArray(value.warnings) || value.warnings.length > 12 || value.warnings.some(item => !boundedText(item, 2048)))
        throw invalid();
    try {
        const definition = assistantDefinition(value.definition);
        if (definition.basePreset !== value.basePreset)
            throw invalid();
        const patch = JSON.parse(value.patch);
        if (!Array.isArray(patch) || patch.length !== 1 || !isRow(patch[0]) || Object.keys(patch[0]).join() !== 'insert'
            || !Array.isArray(patch[0].insert) || patch[0].insert.length !== 1)
            throw invalid();
        const item = patch[0].insert[0];
        if (!isRow(item) || Object.keys(item).sort().join() !== 'config,id,name' || item.id !== value.rowId || item.name !== moduleName
            || !isRow(item.config) || Object.keys(item.config).sort().join() !== 'description,id,name,plugins'
            || item.config.id !== value.presetId || item.config.name !== definition.name || item.config.description !== definition.description)
            throw invalid();
        const plugins = rows(item.config.plugins), persona = plugins.find(item => item.name === personaName);
        transform(plugins, definition); // Validate exact supported native child-list/persona shape.
        if (!persona || !isRow(persona.config) || typeof persona.config.prefix !== 'string'
            || !persona.config.prefix.endsWith(`\n\n${assistantGuidance(definition)}`)
            || persona.config.complete !== false || persona.config.includeRuntimeContext !== true)
            throw invalid();
        return structuredClone(value);
    }
    catch {
        throw invalid();
    }
}
async function nativeCodec(anchor) {
    const hostRequire = createRequire(anchor);
    const includePath = hostRequire.resolve('@deepseek-ai/cordis-plugin-include');
    const include = await import(pathToFileURL(includePath).href);
    const yaml = createRequire(includePath)('js-yaml');
    if (!include.entryListSchema || typeof yaml.load !== 'function')
        throw error('assistant-native-unavailable', '宿主不提供原生声明解析器');
    return { load: content => yaml.load(content, { schema: include.entryListSchema }) };
}
/** Public owner-management route, identical to the native plugin page. It
 * intentionally never enters plugin_manager's Agent tool or fabricates its
 * permission context. Main core owns exact preview consent on a private RPC.
 * Native package/compatibility/script checks remain in installBundle. */
export function createNativeAssistantAdapter(host, options = {}) {
    return new Adapter(host, options);
}
class Adapter {
    host;
    options;
    lifetime = new AbortController();
    active = new Set();
    codec;
    queue = Promise.resolve();
    constructor(host, options) {
        this.host = host;
        this.options = options;
    }
    async environment(signal) {
        this.lifetime.signal.throwIfAborted();
        signal.throwIfAborted();
        const presets = this.host.get('agentPresets'), manager = this.host.get('pluginManager');
        const profile = this.host.get('profileContext');
        if (!presets || typeof presets.list !== 'function' || typeof presets.readDocument !== 'function' || typeof presets.compositionInventory !== 'function'
            || !manager || typeof manager.listBundles !== 'function' || typeof manager.installBundle !== 'function'
            || typeof manager.cancelInstall !== 'function' || typeof manager.waitForInstall !== 'function'
            || typeof profile?.dir !== 'string' || !path.isAbsolute(profile.dir) || typeof profile.installAnchor !== 'string' || !path.isAbsolute(profile.installAnchor))
            throw error('assistant-native-unavailable', '此宿主缺少新版声明式 preset 或公开 bundle 管理能力，不能创建职业预设');
        const profileDir = await realpath(profile.dir), anchor = await realpath(profile.installAnchor);
        this.codec ??= this.options.codec ? Promise.resolve(this.options.codec) : nativeCodec(anchor);
        const codec = await this.codec;
        signal.throwIfAborted();
        this.lifetime.signal.throwIfAborted();
        return { presets, manager, profileDir, anchor, codec, fingerprint: digest(`${profileDir}\0${anchor}`) };
    }
    async roster(env) {
        const list = await env.presets.list();
        if (!Array.isArray(list) || list.length > 256 || list.some(item => !isRow(item) || typeof item.id !== 'string')
            || new Set(list.map(item => item.id)).size !== list.length)
            throw error('assistant-native-unavailable', '原生预设目录无效');
        return list;
    }
    async probe() {
        try {
            const env = await this.environment(noSignal), roster = await this.roster(env), basePresets = [];
            for (const item of roster) {
                if (item.broken !== undefined)
                    continue;
                try {
                    const base = parseBase(env.codec, await env.presets.readDocument(String(item.id)), String(item.id));
                    // Probe the exact composition shape; no new registry rows or Agents.
                    transform(base, { schemaVersion: 1, name: 'Probe', description: 'Read-only capability probe', role: 'Probe', methods: ['Probe'], onboarding: [], skills: ['human-workflow'], basePreset: String(item.id) });
                    basePresets.push({ id: String(item.id), name: typeof item.name === 'string' ? item.name : String(item.id) });
                }
                catch { /* Unsupported bases are omitted, never silently rewritten. */ }
            }
            const creator = roster.find(item => item.id === 'cordis' && item.broken === undefined);
            return { supported: basePresets.length > 0, ...(basePresets.length ? {} : { reason: '没有可安全派生的原生基础预设' }), basePresets,
                ...(creator ? { creatorPresetId: 'cordis' } : {}) };
        }
        catch (cause) {
            return { supported: false, basePresets: [], reason: cause instanceof NativeAdapterError
                    ? cause.message : '原生预设能力不可用，请在宿主核对配置' };
        }
    }
    async preview(input, signal) {
        const env = await this.environment(signal), definition = assistantDefinition(input.definition);
        if (!idValid(input.presetId))
            throw error('assistant-preset-id-invalid', '新预设 ID 不符合固定格式');
        const roster = await this.roster(env), baseRow = roster.find(item => item.id === definition.basePreset);
        if (!baseRow || baseRow.broken !== undefined)
            throw error('assistant-base-unavailable', '基础预设不存在或无法加载');
        if (roster.some(item => item.id === input.presetId))
            throw error('assistant-preset-exists', '不能覆盖已存在的原生预设');
        const base = parseBase(env.codec, await env.presets.readDocument(definition.basePreset), definition.basePreset);
        const skillRegistry = this.host.get('skills');
        for (const name of definition.skills) {
            const skill = await skillRegistry?.get?.(name);
            if (!isRow(skill) || skill.name !== name || !isRow(skill.invocation) || skill.invocation.modelInvocable !== true)
                throw error('assistant-skill-unavailable', `原生技能 ${name} 当前不可供模型调用`);
        }
        const rowId = `harness-assistant-${input.presetId}`, bundleName = `@harness-remote-assistants/${input.presetId}`;
        const patch = JSON.stringify([{ insert: [{ id: rowId, name: moduleName, config: {
                            id: input.presetId, name: definition.name, description: definition.description, plugins: transform(base, definition),
                        } }] }], null, 2) + '\n';
        const bundles = await env.manager.listBundles();
        if (!Array.isArray(bundles) || bundles.some(bundle => isRow(bundle) && bundle.name === bundleName))
            throw error('assistant-preset-exists', '原生 bundle 名称已存在或目录不可读');
        if (typeof env.presets.defaultId !== 'string' || !env.presets.defaultId)
            throw error('assistant-native-unavailable', '无法确认宿主默认预设');
        signal.throwIfAborted();
        this.lifetime.signal.throwIfAborted();
        return { schema: 'assistant.native.preview.v1', presetId: input.presetId, basePreset: definition.basePreset, bundleName, rowId, definition,
            baseDigest: digest(canonical(base)), patchDigest: digest(patch), patch, profileFingerprint: env.fingerprint, defaultPreset: env.presets.defaultId,
            warnings: ['将新增独立原生预设和可卸载 bundle，不修改默认预设或已有会话。',
                '沿用所选基础预设的全部既有插件和权限边界；预设不是安全沙箱。',
                '职业说明和引导问题是模板，具体身份和业务资料保存在独立工作实例中。',
                '宿主可能要求重启；安装成功不等于当前会话已经切换预设。'] };
    }
    validate(preview) {
        validateNativeAssistantPreview(preview);
    }
    target(env, preview) { return path.join(env.profileDir, artifactRoot, preview.presetId); }
    async artifact(env, preview, create) {
        const root = path.join(env.profileDir, artifactRoot), target = this.target(env, preview);
        if (create) {
            await mkdir(root, { recursive: true, mode: 0o700 });
            if ((await lstat(root)).isSymbolicLink() || await realpath(root) !== root)
                throw error('assistant-native-path-invalid', '预设包目录不可重定向');
            try {
                await mkdir(target, { mode: 0o700 });
                for (const [name, data] of [['package.json', manifest(preview)], ['cordis.patch.yml', preview.patch]]) {
                    const file = await open(path.join(target, name), 'wx', 0o600);
                    try {
                        await file.writeFile(data);
                        await file.sync();
                    }
                    finally {
                        await file.close();
                    }
                }
            }
            catch (cause) {
                if (cause.code !== 'EEXIST')
                    throw cause;
            }
        }
        if ((await lstat(root)).isSymbolicLink() || (await lstat(target)).isSymbolicLink() || await realpath(target) !== target)
            throw error('assistant-native-path-invalid', '预设包目录不可重定向');
        const entries = await readdir(target);
        if (entries.some(name => !['package.json', 'cordis.patch.yml', 'install-state.json'].includes(name)))
            throw error('assistant-native-artifact-changed', '预设包含未经预览的额外文件');
        for (const [name, expected] of [['package.json', manifest(preview)], ['cordis.patch.yml', preview.patch]]) {
            const filename = path.join(target, name), stat = await lstat(filename);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 384 * 1024 || await readFile(filename, 'utf8') !== expected)
                throw error('assistant-native-artifact-changed', '预设包已变化，未安装');
        }
        return target;
    }
    async receipt(target) {
        try {
            const filename = path.join(target, 'install-state.json'), stat = await lstat(filename);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2048)
                throw error('assistant-native-artifact-changed', '安装记录无效');
            const value = JSON.parse(await readFile(filename, 'utf8'));
            if (!isRow(value) || value.schema !== 'assistant.native.install.v1' || typeof value.patchDigest !== 'string' || typeof value.requestId !== 'string'
                || !['started', 'settled'].includes(String(value.phase)))
                throw error('assistant-native-artifact-changed', '安装记录无效');
            return value;
        }
        catch (cause) {
            if (cause.code === 'ENOENT')
                return;
            throw cause;
        }
    }
    async saveReceipt(target, value, initial = false) {
        const filename = path.join(target, 'install-state.json'), temporary = `${filename}.${randomUUID()}.tmp`;
        const file = await open(initial ? filename : temporary, 'wx', 0o600);
        try {
            await file.writeFile(JSON.stringify(value));
            await file.sync();
        }
        finally {
            await file.close();
        }
        if (!initial)
            await rename(temporary, filename);
    }
    install(preview, signal) {
        const result = this.queue.then(() => this.performInstall(preview, signal));
        this.queue = result.catch(() => { });
        return result;
    }
    async performInstall(preview, signal) {
        this.validate(preview);
        const env = await this.environment(signal);
        if (env.fingerprint !== preview.profileFingerprint)
            throw error('assistant-native-profile-changed', '预览不属于当前宿主 profile');
        const target = this.target(env, preview), prior = await this.receipt(target);
        if (prior)
            return this.verify(preview, signal); // Never repeat an uncertain native package operation.
        const rebuilt = await this.preview({ presetId: preview.presetId, definition: preview.definition }, signal);
        if (canonical(rebuilt) !== canonical(preview))
            throw error('assistant-native-preview-stale', '基础预设、默认项或能力已变化，请重新预览');
        await this.artifact(env, preview, true);
        const active = AbortSignal.any([signal, this.lifetime.signal]);
        active.throwIfAborted();
        const receipt = { schema: 'assistant.native.install.v1', patchDigest: preview.patchDigest, requestId: randomUUID(), phase: 'started' };
        await this.saveReceipt(target, receipt, true);
        if (active.aborted) {
            await this.saveReceipt(target, { ...receipt, phase: 'settled', application: 'cancelled' });
            active.throwIfAborted();
        }
        const request = Promise.resolve().then(() => env.manager.installBundle(target, { enabled: true, requestId: receipt.requestId }));
        this.active.add(request);
        let cancellation;
        const abort = () => { cancellation ??= Promise.resolve().then(() => env.manager.cancelInstall(receipt.requestId)).catch(() => undefined); };
        active.addEventListener('abort', abort, { once: true });
        if (active.aborted)
            abort();
        let result;
        try {
            result = await request;
        }
        catch {
            return { presetId: preview.presetId, state: 'unknown', message: '原生安装结果未知，请核验；不会自动重复安装。' };
        }
        finally {
            active.removeEventListener('abort', abort);
            await cancellation;
            this.active.delete(request);
        }
        if (!isRow(result) || !['applied', 'restart-required', 'overridden', 'failed', 'cancelled'].includes(String(result.application)))
            return { presetId: preview.presetId, state: 'unknown', message: '宿主返回了未知安装结果，请核验。' };
        await this.saveReceipt(target, { ...receipt, phase: 'settled', application: String(result.application) });
        if (result.error !== undefined || result.application !== 'applied' && result.application !== 'restart-required')
            return { presetId: preview.presetId, state: 'unknown', message: result.application === 'cancelled' ? '宿主确认本次安装已取消；未声称预设可用。' : '原生安装或启用未完成，请在宿主插件页查看；未自动移除任何内容。' };
        return this.verify(preview, noSignal);
    }
    async verify(preview, signal) {
        this.validate(preview);
        const unknown = (message) => ({ presetId: preview.presetId, state: 'unknown', message });
        const env = await this.environment(signal);
        if (env.fingerprint !== preview.profileFingerprint)
            throw error('assistant-native-profile-changed', '预览不属于当前宿主 profile');
        let target;
        try {
            target = await this.artifact(env, preview, false);
        }
        catch (cause) {
            if (cause.code === 'ENOENT')
                return unknown('未找到本次安装的固定预设包。');
            throw cause;
        }
        const receipt = await this.receipt(target);
        if (!receipt || receipt.patchDigest !== preview.patchDigest)
            return unknown('没有匹配的持久安装记录。');
        const bundles = await env.manager.listBundles(), roster = await this.roster(env);
        signal.throwIfAborted();
        this.lifetime.signal.throwIfAborted();
        if (!Array.isArray(bundles))
            return unknown('无法读取原生 bundle 安装状态。');
        const matching = bundles.filter(item => isRow(item) && item.name === preview.bundleName);
        if (matching.length !== 1)
            return unknown('原生 bundle 尚未确认安装。');
        const bundle = matching[0];
        if (bundle.installed !== true || bundle.enabled !== true || bundle.version !== '1.0.0' || bundle.error !== undefined
            || !Array.isArray(bundle.rows) || bundle.rows.length !== 1 || !Array.isArray(bundle.overrides) || bundle.overrides.length !== 0
            || !bundle.rows.some(item => isRow(item) && item.rowId === preview.rowId && item.moduleName === moduleName))
            return unknown('原生 bundle 未启用、声明已变化或存在加载错误。');
        // A later user selection is legitimate. Installation never writes this
        // setting, and historical verification must not restore or freeze it.
        const defaultNote = env.presets.defaultId !== preview.defaultPreset ? '宿主默认预设后来已变化，本适配器保留了当前选择。' : '';
        const installed = roster.find(item => item.id === preview.presetId);
        if (!installed)
            return receipt.application === 'restart-required'
                ? { presetId: preview.presetId, state: 'pending-restart', message: `原生 bundle 已保存；需要宿主重启后再次核验预设。${defaultNote}` }
                : unknown('bundle 已保存，但原生预设尚未确认生效。');
        if (installed.broken !== undefined)
            return unknown('原生预设存在加载错误；未删除其他预设。');
        const document = await env.presets.readDocument(preview.presetId), actual = parseBase(env.codec, document, preview.presetId);
        const patch = JSON.parse(preview.patch);
        if (canonical(actual) !== canonical(patch[0].insert[0].config.plugins))
            return unknown('原生预设内容与批准的版本不一致。');
        signal.throwIfAborted();
        this.lifetime.signal.throwIfAborted();
        return { presetId: preview.presetId, state: 'installed', message: `原生预设已安装并通过内容核验；请显式新建或选择空会话使用。${defaultNote}` };
    }
    async close() {
        this.lifetime.abort(error('assistant-native-disabled', '原生预设适配器已关闭'));
        await this.queue.catch(() => { });
        await Promise.allSettled([...this.active]);
    }
}
