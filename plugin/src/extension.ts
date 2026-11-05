import * as vscode from 'vscode';
import * as path from 'path';
import { ITranslateRegistry, KnowledgePack } from './types';
import { DaiguaTranslate, TranslatorSettings } from './daigua-translate';
import { KnowledgeLoader, PackLoadReport, resolvePackPaths } from './knowledge-loader';
import { formatEntries } from './symbol-matcher';

const sourceId = 'elio-zwd.daigua-translator-daigua';
let stop: (() => void) | undefined;

export async function activate(context: vscode.ExtensionContext) {
  let loadedByPath = new Map<string, KnowledgePack>();
  let loadedPacks: KnowledgePack[] = [];
  let reloadRequestId = 0;
  let disposed = false;
  let report: PackLoadReport | undefined;
  let loadedAt = '';
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let watchers: vscode.Disposable[] = [];
  const output = vscode.window.createOutputChannel('呆瓜翻译器');
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = 'daiguaTranslate.quickSettings';
  const config = () => vscode.workspace.getConfiguration('daiguaTranslate');
  const settings = (): TranslatorSettings => ({
    bingEnabled: config().get<boolean>('bingEnabled', true),
    bingTimeoutMs: config().get<number>('bingTimeoutMs', 5000),
    includeParameters: config().get<boolean>('includeParameters', true),
  });
  const local = new DaiguaTranslate(() => loadedPacks, undefined, settings);
  const settingTarget = () => vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
  const countEntries = () => loadedPacks.reduce((sum, pack) => sum + pack.entries.length, 0);

  function refreshStatus() {
    const errors = report?.failures.length || 0;
    status.text = `$(book) 呆瓜 ${countEntries()}条 · ${settings().bingEnabled ? 'Bing 开' : '仅本地'}${errors ? ' $(warning)' : ''}`;
    const selected = vscode.workspace.getConfiguration('mtrancode').get<string>('source', '');
    status.tooltip = `知识包 ${loadedPacks.length} 个，词条 ${countEntries()} 条\n` +
      `MTranCode 翻译源：${selected === sourceId ? '已选呆瓜' : '未选呆瓜'}\n` +
      `最近加载：${loadedAt || '尚未完成'}${errors ? `\n加载失败 ${errors} 项（点击查看诊断）` : ''}\n点击打开快捷设置`;
    if (config().get<boolean>('showStatusBar', true)) status.show(); else status.hide();
  }

  function showStatus() {
    const cfg = config();
    const scopes = cfg.inspect<string[]>('packPaths');
    const selected = vscode.workspace.getConfiguration('mtrancode').get<string>('source', '');
    output.appendLine(`\n=== 呆瓜翻译器加载诊断 ${new Date().toLocaleString()} ===`);
    output.appendLine(`插件版本：${context.extension.packageJSON.version}`);
    output.appendLine(`MTranCode 当前翻译源：${selected || '默认'}${selected === sourceId ? '（正确）' : '（请在快捷设置中选择呆瓜翻译源）'}`);
    output.appendLine(`用户路径：${JSON.stringify(scopes?.globalValue || [])}`);
    output.appendLine(`工作区路径：${JSON.stringify(scopes?.workspaceValue || [])}`);
    output.appendLine(`当前生效路径：${JSON.stringify(cfg.get<string[]>('packPaths', []))}`);
    output.appendLine(`最近完成加载：${loadedAt || '尚未完成'}；有效 ${countEntries()} 条词条`);
    for (const [file, pack] of loadedByPath) {
      output.appendLine(`[${report?.failures.some(f => f.path === file) ? '保留旧内容' : '已加载'}] ${file}\n  ${pack.name} v${pack.version}，${pack.entries.length} 条`);
    }
    for (const failure of report?.failures || []) output.appendLine(`[失败] ${failure.path}\n${failure.reason}`);
    output.appendLine(`Bing：${settings().bingEnabled ? '开启' : '关闭'}；等待上限 ${settings().bingTimeoutMs} ms；参数查询：${settings().includeParameters ? '开启' : '关闭'}`);
    output.appendLine('“本地查询”直接检查当前包，不经过 MTranCode 缓存；MTranCode 已缓存的旧翻译不会被本插件清除。');
    output.show(true);
  }

  async function reloadPacks(notify = false): Promise<PackLoadReport | null> {
    const requestId = ++reloadRequestId;
    const paths = config().get<string[]>('packPaths', []);
    const active = new Set(resolvePackPaths(paths));
    loadedByPath = new Map([...loadedByPath].filter(([file]) => active.has(file)));
    loadedPacks = [...loadedByPath.values()];
    refreshStatus();
    const next = await new KnowledgeLoader().loadWithReport(paths, loadedByPath);
    if (disposed || requestId !== reloadRequestId) return null;
    report = next;
    loadedByPath = next.byPath;
    loadedPacks = next.packs;
    loadedAt = new Date().toLocaleString();
    const retained = next.failures.filter(f => f.retained).length;
    const summary = `呆瓜翻译器：加载成功 ${next.loadedCount} 个包，保留旧包 ${retained} 个，当前有效 ${countEntries()} 条词条。`;
    output.appendLine(summary);
    for (const [file, pack] of loadedByPath) output.appendLine(`  ${pack.name} v${pack.version} | ${pack.entries.length} 条 | ${file}`);
    for (const failure of next.failures) output.appendLine(`[失败] ${failure.path}\n${failure.reason}\n${failure.retained ? '保留上一次有效内容' : '首次加载失败，已跳过'}`);
    refreshStatus();
    if (next.failures.length) {
      void vscode.window.showWarningMessage(`${summary} 失败路径：${next.failures.map(f => f.path).join('；')}。详情见“呆瓜翻译器”输出。`);
    } else if (notify) void vscode.window.showInformationMessage(summary);
    return next;
  }

  function watchPacks() {
    for (const watcher of watchers) watcher.dispose();
    watchers = [];
    if (debounce) clearTimeout(debounce);
    if (!config().get<boolean>('autoReload', true)) return;
    const paths = resolvePackPaths(config().get<string[]>('packPaths', []));
    const key = (file: string) => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);
    const files = new Set(paths.map(key));
    const onChange = (uri: vscode.Uri) => {
      if (disposed || !files.has(key(uri.fsPath))) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { void reloadPacks(); }, 250);
    };
    for (const directory of new Set(paths.map(file => path.dirname(file)))) {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(directory, '*'));
      watchers.push(watcher, watcher.onDidChange(onChange), watcher.onDidCreate(onChange), watcher.onDidDelete(onChange));
    }
  }

  async function choosePacks() {
    const files = await vscode.window.showOpenDialog({
      title: '选择要使用的知识包（替换当前路径列表，可多选）',
      canSelectMany: true, canSelectFiles: true, canSelectFolders: false,
      filters: { '知识包 JSON': ['json'] }, openLabel: '使用这些知识包',
    });
    if (!files?.length) return;
    const candidate = await new KnowledgeLoader().loadWithReport(files.map(file => file.fsPath));
    if (candidate.failures.length) {
      for (const failure of candidate.failures) output.appendLine(`[未切换] ${failure.path}\n${failure.reason}`);
      output.show(true);
      void vscode.window.showWarningMessage('所选文件有无效知识包，未修改当前路径。请选择 pack-revised.json 等含 entries 的知识包。');
      return;
    }
    await config().update('packPaths', files.map(file => file.fsPath), settingTarget());
    await reloadPacks(true);
  }

  async function queryLocal() {
    const editor = vscode.window.activeTextEditor;
    const selection = editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection).trim() : '';
    const word = editor?.document.getWordRangeAtPosition(editor.selection.active);
    const value = selection || (word ? editor!.document.getText(word) : '');
    const symbol = await vscode.window.showInputBox({
      title: '呆瓜翻译器：本地查询（不联网，不经过宿主翻译缓存）',
      prompt: '输入一个符号，例如 interval、worker 或 arg；同名候选全部显示', value,
      validateInput: text => /^[A-Za-z_]\w*(?:\s*\(\s*\))?$/.test(text.trim()) ? undefined : '请输入单个符号名称，可带空括号。',
    });
    if (symbol === undefined) return;
    const entries = local.findLocalEntries(symbol);
    output.appendLine(`\n[本地查询] ${symbol.trim()} | ${loadedPacks.length} 个包，${countEntries()} 条词条 | ${new Date().toLocaleString()}`);
    output.appendLine(entries.length ? `[本地命中 ${entries.length} 项]\n${formatEntries(entries)}` : '本地未命中。请检查生效路径、加载诊断及名称大小写；参数查询需在设置中开启。');
    output.show(true);
  }

  async function quickSettings() {
    const items = [
      { label: '$(folder-opened) 选择知识包文件', description: '可多选；在当前工作区保存路径，无需手写 JSON', action: choosePacks },
      { label: `$(globe) Bing 回退：${settings().bingEnabled ? '开启 → 关闭' : '关闭 → 开启'}`, description: '关闭后未命中立即结束，不发起联网翻译', action: async () => { await config().update('bingEnabled', !settings().bingEnabled, settingTarget()); } },
      { label: '$(search) 本地查询', description: '直接检查词条，绕过 MTranCode 缓存', action: queryLocal },
      { label: '$(info) 查看加载诊断', description: '包名、路径、数量、设置来源和错误原因', action: showStatus },
      { label: '$(refresh) 重新加载知识包', action: () => reloadPacks(true) },
      { label: '$(check) 将 MTranCode 翻译源设为呆瓜', action: async () => { await vscode.workspace.getConfiguration('mtrancode').update('source', sourceId, settingTarget()); refreshStatus(); } },
      { label: '$(settings-gear) 打开全部设置', action: () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:elio-zwd.daigua-translator') },
    ];
    const selected = await vscode.window.showQuickPick(items, { title: '呆瓜翻译器快捷设置', placeHolder: `当前有效 ${countEntries()} 条；设置保存到${vscode.workspace.workspaceFolders?.length ? '当前工作区' : '用户'}` });
    if (selected) await selected.action();
  }

  for (const [name, callback] of Object.entries({ reloadPacks: () => reloadPacks(true), choosePacks, queryLocal, showStatus, quickSettings })) {
    context.subscriptions.push(vscode.commands.registerCommand(`daiguaTranslate.${name}`, callback));
  }
  context.subscriptions.push(output, status, vscode.workspace.onDidChangeConfiguration(async event => {
    if (event.affectsConfiguration('daiguaTranslate.packPaths') || event.affectsConfiguration('daiguaTranslate.autoReload')) watchPacks();
    if (event.affectsConfiguration('daiguaTranslate.packPaths')) await reloadPacks();
    refreshStatus();
  }));
  context.subscriptions.push(vscode.languages.registerHoverProvider([{ language: 'c' }, { language: 'cpp' }], {
    provideHover(document, position) {
      if (disposed || !config().get<boolean>('localHover', true)) return;
      const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
      if (!range) return;
      const entries = local.findLocalEntries(document.getText(range));
      if (!entries.length) return;
      // Keep pack descriptions as plain text: no command links or trusted Markdown from JSON.
      const content = new vscode.MarkdownString();
      content.appendMarkdown('**呆瓜 · 本地知识包**\n\n');
      content.appendText(formatEntries(entries));
      return new vscode.Hover(content, range);
    },
  }));
  stop = () => {
    disposed = true;
    ++reloadRequestId;
    if (debounce) clearTimeout(debounce);
    for (const watcher of watchers) watcher.dispose();
    watchers = [];
    loadedByPath.clear();
    loadedPacks = [];
  };
  context.subscriptions.push({ dispose: stop });
  watchPacks();
  await reloadPacks();
  return {
    extendTranslate: (registry: ITranslateRegistry) => {
      registry('daigua', class extends DaiguaTranslate {
        constructor() { super(() => loadedPacks, undefined, settings); }
      });
    },
  };
}

export function deactivate() { stop?.(); stop = undefined; }
