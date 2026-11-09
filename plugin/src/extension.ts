import * as vscode from 'vscode';
import * as path from 'path';
import { KnowledgePack } from './types';
import * as fs from 'fs';
import { QueryResult, projectResult, errorResult } from './query-result';
import { hoverMarkdown } from './result-renderer';
import { ReaderPanels } from './webviews';
import { OfflineDictionary, validateTerms } from './offline-dictionary';
import { DaiguaTranslate, TranslatorSettings } from './daigua-translate';
import { KnowledgeLoader, PackLoadReport, resolvePackPaths } from './knowledge-loader';
import { formatEntries } from './symbol-matcher';

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
  const offline = new OfflineDictionary(() => ({
    dictionaryPath: config().get<string>('dictionaryPath', ''),
    technicalLibraryPaths: config().get<string[]>('technicalLibraryPaths', []),
  }), message => output.appendLine('[词典诊断] ' + message));
  let epoch = 0;
  let hoverSequence = 0;
  let commandSequence = 0;
  let manual: { document: vscode.TextDocument; version: number; anchor: vscode.Position;
    range: vscode.Range; result: QueryResult; epoch: number } | undefined;
  const invalidate = () => { ++epoch; ++hoverSequence; ++commandSequence; manual = undefined; };
  const hoverMode = (): 'online' | 'ecdict' | 'off' => {
    const mode = config().get<string>('hoverFallback', 'online');
    return mode === 'ecdict' || mode === 'off' ? mode : 'online';
  };
  const asHover = (result: QueryResult, range: vscode.Range) => {
    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown(hoverMarkdown(result, config().get<boolean>('debugMode', false)));
    markdown.isTrusted = { enabledCommands: ['daiguaTranslate.openDetails', 'daiguaTranslate.openSettings'] };
    return new vscode.Hover(markdown, range);
  };
  function selectedText(editor = vscode.window.activeTextEditor) {
    if (!editor) return '';
    if (!editor.selection.isEmpty) return editor.document.getText(editor.selection);
    const word = editor.document.getWordRangeAtPosition(editor.selection.active, /[A-Za-z_]\w*/);
    return word ? editor.document.getText(word) : '';
  }
  async function display(result: QueryResult, editor: vscode.TextEditor | undefined,
    snapshot: { version: number; anchor: vscode.Position; epoch: number; request: number }) {
    if (disposed || snapshot.epoch !== epoch || snapshot.request !== commandSequence) return;
    if (!editor) { panels.showReader(result); return; }
    if (vscode.window.activeTextEditor !== editor || editor.document.version !== snapshot.version ||
        !editor.selection.active.isEqual(snapshot.anchor)) return;
    const range = editor.document.getWordRangeAtPosition(snapshot.anchor) || new vscode.Range(snapshot.anchor, snapshot.anchor);
    manual = { document: editor.document, version: snapshot.version, anchor: snapshot.anchor, range, result, epoch };
    if (panels.follows) panels.setResult(result);
    await vscode.commands.executeCommand('editor.action.showHover');
  }
  async function translateInput(input: boolean) {
    const content = input ? await vscode.window.showInputBox({ title: '呆瓜翻译器：输入文本翻译',
      prompt: '输入名称或普通文本（最多 1000 字符）', value: selectedText(),
      validateInput: text => text.length > 1000 ? '单次最多 1000 字符' : undefined }) : selectedText();
    if (content === undefined || !content.trim()) return;
    const editor = vscode.window.activeTextEditor;
    const snapshot = { version: editor?.document.version || 0, anchor: editor?.selection.active!, epoch, request: ++commandSequence };
    manual = undefined;
    try {
      const result = await local.queryResult(content, 'online', offline);
      if (result) { logResult(result); await display(result, editor, snapshot); }
    } catch (error) { output.appendLine(String(error)); await display(errorResult(content, error), editor, snapshot); }
  }
  const settingTarget = () => vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
  const countEntries = () => loadedPacks.reduce((sum, pack) => sum + pack.entries.length, 0);

  let panelSequence = 0;
  let panelTimer: ReturnType<typeof setTimeout> | undefined;
  const debugMode = () => config().get<boolean>('debugMode', false);
  const defaultValues: Record<string, unknown> = { localHover: true, bingEnabled: true, hoverFallback: 'online',
    showStatusBar: true, autoReload: true, includeParameters: true, debugMode: false,
    bingTimeoutMs: 5000, packPaths: [], technicalLibraryPaths: [], dictionaryPath: '' };
  const panels = new ReaderPanels(debugMode, () => ({
    values: Object.fromEntries(Object.entries(defaultValues).map(([k, v]) => [k, config().get(k, v)])),
    scope: vscode.workspace.workspaceFolders?.length ? '当前工作区' : '用户设置', count: countEntries(),
    packs: config().get<string[]>('packPaths', []).map(file => ({ path: file,
      status: report?.failures.some(f => f.path === path.resolve(file))
        ? (report.failures.find(f => f.path === path.resolve(file))!.retained ? '加载失败，保留上次内容' : '加载失败，查看诊断')
        : loadedByPath.has(path.resolve(file)) ? '已加载' : '等待加载' })),
  }), settingsAction, schedulePanel);
  context.subscriptions.push(panels);
  function logResult(result: QueryResult) {
    for (const message of result.diagnostics) output.appendLine('[查询诊断] ' + message);
  }
  function schedulePanel() {
    const sequence = ++panelSequence;
    if (panelTimer) clearTimeout(panelTimer);
    if (!panels.follows || disposed) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor) return; // Moving focus into a webview retains the current word.
    if (!['c', 'cpp'].includes(editor.document.languageId)) { panels.setResult(); return; }
    const word = editor.document.getWordRangeAtPosition(editor.selection.active, /[A-Za-z_]\w*/);
    if (!word) { panels.setResult(); return; }
    const value = editor.document.getText(word), version = editor.document.version, currentEpoch = epoch;
    panelTimer = setTimeout(async () => {
      if (!panels.follows || disposed || sequence !== panelSequence) return;
      let result: QueryResult | undefined;
      try { result = await local.queryResult(value, hoverMode(), offline); }
      catch (error) { output.appendLine(String(error)); result = errorResult(value, error); }
      if (disposed || !panels.follows || sequence !== panelSequence || currentEpoch !== epoch ||
        editor.document.version !== version || vscode.window.activeTextEditor !== editor) return;
      if (result) logResult(result);
      panels.setResult(result);
    }, 350);
  }
  async function openDetails(content?: unknown) {
    const text = typeof content === 'string' ? content : selectedText();
    if (typeof content === 'string' && content.length > 1000) return;
    panels.showReader();
    if (!text.trim()) { schedulePanel(); return; }
    const sequence = ++panelSequence, currentEpoch = epoch;
    if (panelTimer) clearTimeout(panelTimer);
    try {
      const result = await local.queryResult(text, 'online', offline);
      if (result && !disposed && panels.isOpen && sequence === panelSequence && currentEpoch === epoch) {
        logResult(result); panels.setResult(result);
      }
    } catch (error) {
      output.appendLine(String(error));
      if (!disposed && panels.isOpen && sequence === panelSequence && currentEpoch === epoch) panels.setResult(errorResult(text, error));
    }
  }
  async function settingsAction(message: Record<string, unknown>) {
    const key = message.key;
    if (message.action === 'set' && typeof key === 'string') {
      const value = message.value;
      const bools = ['localHover', 'bingEnabled', 'showStatusBar', 'autoReload', 'includeParameters', 'debugMode'];
      if (bools.includes(key) && typeof value === 'boolean' || key === 'hoverFallback' && ['online','ecdict','off'].includes(value as string) ||
          key === 'bingTimeoutMs' && typeof value === 'number' && Number.isFinite(value) && value >= 100 && value <= 30000) {
        await config().update(key, value, settingTarget());
      } else throw Error('设置值无效');
    } else if ((message.action === 'choose' || message.action === 'remove') &&
        typeof key === 'string' && ['packPaths','technicalLibraryPaths','dictionaryPath'].includes(key)) {
      if (message.action === 'remove') {
        if (!Number.isSafeInteger(message.index) || (message.index as number) < 0) return;
        if (key === 'dictionaryPath') await config().update(key, '', settingTarget());
        else await config().update(key, config().get<string[]>(key, []).filter((_, i) => i !== message.index), settingTarget());
      } else {
        const files = await vscode.window.showOpenDialog({ canSelectFolders: key === 'dictionaryPath',
          canSelectFiles: key !== 'dictionaryPath', canSelectMany: key !== 'dictionaryPath',
          title: key === 'dictionaryPath' ? '选择含 manifest.json 的词典目录' : '添加词库 JSON',
          filters: key === 'dictionaryPath' ? undefined : { '词库 JSON': ['json'] } });
        if (!files?.length) return;
        if (key === 'dictionaryPath') {
          const manifest = JSON.parse((await fs.promises.readFile(path.join(files[0].fsPath, 'manifest.json'), 'utf8')).replace(/^\uFEFF/, ''));
          if (manifest.format_version !== 1 || !manifest.shards || !/^[a-f0-9]{64}$/i.test(manifest.source_sha256)) throw Error('词典索引格式不兼容');
          await config().update(key, files[0].fsPath, settingTarget());
        } else {
          if (key === 'packPaths') {
            const next = await new KnowledgeLoader().loadWithReport(files.map(f => f.fsPath));
            if (next.failures.length) throw Error('所选知识包无效，当前配置未修改');
          } else for (const file of files) validateTerms(JSON.parse((await fs.promises.readFile(file.fsPath, 'utf8')).replace(/^\uFEFF/, '')));
          await config().update(key, [...new Set([...config().get<string[]>(key, []), ...files.map(f => f.fsPath)])], settingTarget());
        }
      }
    } else if (message.action === 'reload') await reloadPacks(true);
    else if (message.action === 'diagnostics') showStatus();
    else if (message.action === 'nativeSettings') await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:elio-zwd.daigua-translator');
    panels.refresh();
  }

  function refreshStatus() {
    const errors = report?.failures.length || 0;
    status.text = `$(book) 呆瓜 ${countEntries()}条 · ${settings().bingEnabled ? 'Bing 开' : '仅本地'}${errors ? ' $(warning)' : ''}`;
    status.tooltip = `知识包 ${loadedPacks.length} 个，词条 ${countEntries()} 条\n` +
      `悬停模式：${hoverMode()}；词典：${config().get<string>('dictionaryPath', '') || '未配置'}\n` +
      `最近加载：${loadedAt || '尚未完成'}${errors ? `\n加载失败 ${errors} 项（点击查看诊断）` : ''}\n点击打开快捷设置`;
    if (config().get<boolean>('showStatusBar', true)) status.show(); else status.hide();
    panels.refresh();
  }

  function showStatus() {
    const cfg = config();
    const scopes = cfg.inspect<string[]>('packPaths');
    output.appendLine(`\n=== 呆瓜翻译器加载诊断 ${new Date().toLocaleString()} ===`);
    output.appendLine(`插件版本：${context.extension.packageJSON.version}`);
    output.appendLine(`悬停模式：${hoverMode()}；ECDICT：${config().get<string>('dictionaryPath', '') || '未配置'}；技术库：${JSON.stringify(config().get<string[]>('technicalLibraryPaths', []))}`);
    output.appendLine(`用户路径：${JSON.stringify(scopes?.globalValue || [])}`);
    output.appendLine(`工作区路径：${JSON.stringify(scopes?.workspaceValue || [])}`);
    output.appendLine(`当前生效路径：${JSON.stringify(cfg.get<string[]>('packPaths', []))}`);
    output.appendLine(`最近完成加载：${loadedAt || '尚未完成'}；有效 ${countEntries()} 条词条`);
    for (const [file, pack] of loadedByPath) {
      output.appendLine(`[${report?.failures.some(f => f.path === file) ? '保留旧内容' : '已加载'}] ${file}\n  ${pack.name} v${pack.version}，${pack.entries.length} 条`);
    }
    for (const failure of report?.failures || []) output.appendLine(`[失败] ${failure.path}\n${failure.reason}`);
    output.appendLine(`Bing：${settings().bingEnabled ? '开启' : '关闭'}；等待上限 ${settings().bingTimeoutMs} ms；参数查询：${settings().includeParameters ? '开启' : '关闭'}`);
    output.show(true);
  }

  async function reloadPacks(notify = false): Promise<PackLoadReport | null> {
    invalidate();
    offline.reset();
    const requestId = ++reloadRequestId;
    const paths = config().get<string[]>('packPaths', []);
    const active = new Set(resolvePackPaths(paths));
    loadedByPath = new Map([...loadedByPath].filter(([file]) => active.has(file)));
    loadedPacks = [...loadedByPath.values()];
    refreshStatus();
    const next = await new KnowledgeLoader().loadWithReport(paths, loadedByPath);
    if (disposed || requestId !== reloadRequestId) return null;
    invalidate();
    report = next;
    for (const warning of next.warnings) output.appendLine('[音标诊断] ' + warning);
    loadedByPath = next.byPath;
    loadedPacks = next.packs;
    loadedAt = new Date().toLocaleString();
    const retained = next.failures.filter(f => f.retained).length;
    const summary = `呆瓜翻译器：加载成功 ${next.loadedCount} 个包，保留旧包 ${retained} 个，当前有效 ${countEntries()} 条词条。`;
    output.appendLine(summary);
    for (const [file, pack] of loadedByPath) output.appendLine(`  ${pack.name} v${pack.version} | ${pack.entries.length} 条 | ${file}`);
    for (const failure of next.failures) output.appendLine(`[失败] ${failure.path}\n${failure.reason}\n${failure.retained ? '保留上一次有效内容' : '首次加载失败，已跳过'}`);
    refreshStatus();
    schedulePanel();
    if (next.failures.length) {
      void vscode.window.showWarningMessage(`${summary} 部分知识包加载失败，详情见设置中的“查看加载诊断”。`);
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
      title: '呆瓜翻译器：本地查询（不联网）',
      prompt: '输入一个符号，例如 interval、worker 或 arg；同名候选全部显示', value,
      validateInput: text => /^[A-Za-z_]\w*(?:\s*\(\s*\))?$/.test(text.trim()) ? undefined : '请输入单个符号名称，可带空括号。',
    });
    if (symbol === undefined) return;
    const editorNow = vscode.window.activeTextEditor;
    const snapshot = { version: editorNow?.document.version || 0, anchor: editorNow?.selection.active!, epoch, request: ++commandSequence };
    const entries = local.findLocalEntries(symbol);
    output.appendLine(`\n[本地查询] ${symbol.trim()} | ${loadedPacks.length} 个包，${countEntries()} 条词条 | ${new Date().toLocaleString()}`);
    output.appendLine(entries.length ? `[本地命中 ${entries.length} 项]\n${formatEntries(entries)}` : '本地未命中。请检查生效路径、加载诊断及名称大小写；参数查询需在设置中开启。');
    const result = entries.length ? projectResult(symbol.trim(), entries) : { text: symbol.trim(), kind: 'error' as const, match: 'none' as const, candidates: [], diagnostics: [], message: '本地知识包未收录此名称。' };
    await display(result, editorNow, snapshot);
  }

  for (const [name, callback] of Object.entries({ reloadPacks: () => reloadPacks(true), choosePacks, queryLocal, showStatus, quickSettings: () => panels.showSettings(), openSettings: () => panels.showSettings(), openDetails, translateSelection: () => translateInput(false), translateText: () => translateInput(true) })) {
    context.subscriptions.push(vscode.commands.registerCommand(`daiguaTranslate.${name}`, callback));
  }
  context.subscriptions.push(output, status, vscode.workspace.onDidChangeConfiguration(async event => {
    if (Object.keys(defaultValues).filter(key => key !== 'debugMode').some(key => event.affectsConfiguration('daiguaTranslate.' + key))) { invalidate(); offline.reset(); schedulePanel(); }
    if (event.affectsConfiguration('daiguaTranslate.packPaths') || event.affectsConfiguration('daiguaTranslate.autoReload')) watchPacks();
    if (event.affectsConfiguration('daiguaTranslate.packPaths')) await reloadPacks();
    refreshStatus();
  }));
  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(() => { invalidate(); schedulePanel(); }),
    vscode.window.onDidChangeActiveTextEditor(() => { invalidate(); schedulePanel(); }),
    vscode.workspace.onDidChangeTextDocument(() => { invalidate(); schedulePanel(); }));
  // One provider owns explicit results in every language and automatic results in C/C++ only.
  context.subscriptions.push(vscode.languages.registerHoverProvider('*', {
    provideHover(document, position, token) {
      const sequence = ++hoverSequence;
      if (disposed) return;
      if (manual && manual.document === document && manual.version === document.version &&
          manual.epoch === epoch && (manual.range.contains(position) || manual.anchor.isEqual(position))) {
        return asHover(manual.result, manual.range);
      }
      if (!config().get<boolean>('localHover', true) || !['c', 'cpp'].includes(document.languageId)) return;
      const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
      if (!range) return;
      const value = document.getText(range);
      const entries = local.findLocalEntries(value);
      if (entries.length) return asHover(projectResult(value, entries), range);
      if (hoverMode() === 'off' || token.isCancellationRequested) return;
      const snapshot = { epoch, version: document.version };
      return local.queryResult(value, hoverMode(), offline).then(result => {
        if (!result || disposed || token.isCancellationRequested || sequence !== hoverSequence ||
            snapshot.epoch !== epoch || snapshot.version !== document.version) return;
        logResult(result);
        return asHover(result, range);
      }).catch(error => {
        if (!disposed && !token.isCancellationRequested && sequence === hoverSequence && snapshot.epoch === epoch && snapshot.version === document.version) {
          output.appendLine(String(error));
          return asHover(errorResult(value, error), range);
        }
      });
    },
  }));
  stop = () => {
    disposed = true;
    invalidate();
    ++reloadRequestId;
    ++panelSequence;
    if (panelTimer) clearTimeout(panelTimer);
    if (debounce) clearTimeout(debounce);
    for (const watcher of watchers) watcher.dispose();
    watchers = [];
    panels.dispose();
    loadedByPath.clear();
    loadedPacks = [];
  };
  context.subscriptions.push({ dispose: stop });
  watchPacks();
  await reloadPacks();
  return { translator: local, panels };
}

export function deactivate() { stop?.(); stop = undefined; }
