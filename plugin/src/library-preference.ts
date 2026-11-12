import type { Memento, WorkspaceConfiguration } from 'vscode';
import * as path from 'path';

const setting = 'libraryDirectory';
const storageKey = 'libraryDirectory.pendingSetting';
type Scope = 'global' | 'workspace';
interface Pending { value: string; before?: string; }
const normalize = (value: unknown) => typeof value === 'string' ? value.trim() : undefined;
const sameDirectory = (a?: string, b?: string): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  const canonical = (value: string) => {
    let result = path.win32.normalize(value);
    if (result.length > path.win32.parse(result).root.length) result = result.replace(/[\\/]+$/, '');
    return result.toLowerCase();
  };
  return canonical(a) === canonical(b);
};

/** Save directory selections even when an upgraded window has a stale schema.
 * Only missing registration uses Memento; ordinary write failures still surface.
 */
export class LibraryPreference {
  private syncing = false;
  constructor(private readonly config: () => WorkspaceConfiguration,
    private readonly stores: { global: Memento; workspace: Memento },
    private readonly log: (message: string) => void = () => {}) {}
  private pending(scope: Scope): Pending | undefined {
    const value = this.stores[scope].get<Pending>(storageKey);
    return value && typeof value.value === 'string' && (value.before === undefined || typeof value.before === 'string') ? value : undefined;
  }
  private native(scope: Scope): string | undefined {
    const inspection = this.config().inspect<string>(setting);
    return normalize(scope === 'workspace' ? inspection?.workspaceValue : inspection?.globalValue);
  }
  registered(): boolean { return this.config().inspect<string>(setting)?.defaultValue !== undefined; }
  private unchanged(scope: Scope, value: Pending): boolean { return sameDirectory(this.native(scope), value.before); }
  get(): string {
    const workspace = this.pending('workspace');
    if (workspace && this.unchanged('workspace', workspace)) return workspace.value;
    const nativeWorkspace = this.native('workspace');
    if (nativeWorkspace !== undefined) return nativeWorkspace;
    const global = this.pending('global');
    if (global && this.unchanged('global', global)) return global.value;
    return normalize(this.config().get<string>(setting, '')) || '';
  }
  private missingRegistration(error: unknown): boolean {
    const text = String(error);
    return /libraryDirectory/.test(text) && /没有注册配置|未注册配置|not (?:a )?registered configuration|configuration.+not registered/i.test(text);
  }
  async save(value: string): Promise<void> {
    const directory = value.trim();
    const scope: Scope = this.config().inspect<string>(setting)?.workspaceValue !== undefined || this.pending('workspace') ? 'workspace' : 'global';
    const before = this.native(scope);
    if (this.registered()) {
      try {
        await this.config().update(setting, directory, scope === 'global' ? 1 : 2);
        await this.stores[scope].update(storageKey, undefined);
        return;
      } catch (error) { if (!this.missingRegistration(error)) throw error; }
    }
    await this.stores[scope].update(storageKey, { value: directory, before });
    this.log('VS Code 尚未注册词库目录配置；已保存目录选择，立即生效，注册恢复后同步。');
  }
  async reconcile(): Promise<void> {
    if (this.syncing || !this.registered()) return;
    this.syncing = true;
    try {
      for (const scope of ['global', 'workspace'] as const) {
        const pending = this.pending(scope);
        if (!pending) continue;
        if (!this.unchanged(scope, pending)) {
          await this.stores[scope].update(storageKey, undefined);
          continue;
        }
        await this.config().update(setting, pending.value, scope === 'global' ? 1 : 2);
        await this.stores[scope].update(storageKey, undefined);
        this.log('词库目录配置已恢复注册，已同步之前保存的目录选择。');
      }
    } catch (error) { this.log('词库目录选择仍已保存；同步设置未完成：' + String(error)); }
    finally { this.syncing = false; }
  }
  diagnostics(): string {
    return `配置已注册：${this.registered()}；待同步用户选择：${!!this.pending('global')}；待同步工作区选择：${!!this.pending('workspace')}`;
  }
}
