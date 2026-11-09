import * as vscode from 'vscode';
import * as path from 'path';
import { KnowledgePack } from './types';
import { OfflineDictionary } from './offline-dictionary';
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
    range: vscode.Range; text: string; epoch: number } | undefined;
  const invalidate = () => { ++epoch; ++hoverSequence; ++commandSequence; manual = undefined; };
  const hoverMode = (): 'online' | 'ecdict' | 'off' => {
    const mode = config().get<string>('hoverFallback', 'online');
    return mode === 'ecdict' || mode === 'off' ? mode : 'online';
  };
  const asHover = (text: string, range: vscode.Range) => {
    const markdown = new vscode.MarkdownString();
    markdown.appendText(text); // Untrusted pack/dictionary/Bing text must never execute Markdown commands.
    return new vscode.Hover(markdown, range);
  };
  function selectedText(editor = vscode.window.activeTextEditor) {
    if (!editor) return '';
    if (!editor.selection.isEmpty) return editor.document.getText(editor.selection);
    const word = editor.document.getWordRangeAtPosition(editor.selection.active, /[A-Za-z_]\w*/);
    return word ? editor.document.getText(word) : '';
  }
  async function display(text: string, editor: vscode.TextEditor | undefined,
    snapshot: { version: number; anchor: vscode.Position; epoch: number; request: number }) {
    if (disposed || snapshot.epoch !== epoch || snapshot.request !== commandSequence) return;
    if (!editor) { output.appendLine('\n' + text); output.show(true); return; }
    if (vscode.window.activeTextEditor !== editor || editor.document.version !== snapshot.version ||
        !editor.selection.active.isEqual(snapshot.anchor)) return;
    const range = editor.document.getWordRangeAtPosition(snapshot.anchor) || new vscode.Range(snapshot.anchor, snapshot.anchor);
    manual = { document: editor.document, version: snapshot.version, anchor: snapshot.anchor, range, text, epoch };
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
    try { await display('原文：' + content + '\n\n' + await local.query(content, 'online', offline), editor, snapshot); }
    catch (error) { await display('翻译失败：' + String(error), editor, snapshot); }
  }
  const settingTarget = () => vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
  const countEntries = () => loadedPacks.reduce((sum, pack) => sum + pack.entries.length, 0);

  function refreshStatus() {
    const errors = report?.failures.length || 0;
    status.text = `$(book) 呆瓜 ${countEntries()}条 · ${settings().bingEnabled ? 'Bing 开' : '仅本地'}${errors ? ' $(warning)' : ''}`;
    status.tooltip = `知识包 ${loadedPacks.length} 个，词条 ${countEntries()} 条\n` +
      `悬停模式：${hoverMode()}；词典：${config().get<string>('dictionaryPath', '') || '未配置'}\n` +
      `最近加载：${loadedAt || '尚未完成'}${errors ? `\n加载失败 ${errors} 项（点击查看诊断）` : ''}\n点击打开快捷设置`;
    if (config().get<boolean>('showStatusBar', true)) status.show(); else status.hide();
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
    const text = entries.length ? '呆瓜 · 本地知识包\n' + formatEntries(entries) : '本地未命中。';
    if (editorNow) await display(text, editorNow, snapshot); else output.show(true);
  }

  async function quickSettings() {
    const items = [
      { label: '$(folder-opened) 选择知识包文件', description: '可多选；在当前工作区保存路径，无需手写 JSON', action: choosePacks },
      { label: `$(globe) Bing 回退：${settings().bingEnabled ? '开启 → 关闭' : '关闭 → 开启'}`, description: '关闭后不发起联网请求，名称可查询离线词典', action: async () => { await config().update('bingEnabled', !settings().bingEnabled, settingTarget()); } },
      { label: '$(symbol-text) 悬停释义模式', description: hoverMode(), action: async () => {
        const mode = await vscode.window.showQuickPick([{ label: '自动联网释义', value: 'online' }, { label: 'ECDICT 词典释义', value: 'ecdict' }, { label: '关闭未收录名称释义', value: 'off' }], { title: '未收录名称的悬停处理' });
        if (mode) await config().update('hoverFallback', mode.value, settingTarget());
      } },
      { label: '$(folder) 选择 ECDICT 索引目录', action: async () => {
        const files = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, title: '选择含 manifest.json 的 ECDICT 索引目录' });
        if (files?.length) await config().update('dictionaryPath', files[0].fsPath, settingTarget());
      } },
      { label: '$(search) 本地查询', description: '直接检查本地知识包，不联网', action: queryLocal },
      { label: '$(info) 查看加载诊断', description: '包名、路径、数量、设置来源和错误原因', action: showStatus },
      { label: '$(refresh) 重新加载知识包', action: () => reloadPacks(true) },
      { label: '$(settings-gear) 打开全部设置', action: () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:elio-zwd.daigua-translator') },
    ];
    const selected = await vscode.window.showQuickPick(items, { title: '呆瓜翻译器快捷设置', placeHolder: `当前有效 ${countEntries()} 条；设置保存到${vscode.workspace.workspaceFolders?.length ? '当前工作区' : '用户'}` });
    if (selected) await selected.action();
  }

  for (const [name, callback] of Object.entries({ reloadPacks: () => reloadPacks(true), choosePacks, queryLocal, showStatus, quickSettings, translateSelection: () => translateInput(false), translateText: () => translateInput(true) })) {
    context.subscriptions.push(vscode.commands.registerCommand(`daiguaTranslate.${name}`, callback));
  }
  context.subscriptions.push(output, status, vscode.workspace.onDidChangeConfiguration(async event => {
    if (event.affectsConfiguration('daiguaTranslate')) { invalidate(); offline.reset(); }
    if (event.affectsConfiguration('daiguaTranslate.packPaths') || event.affectsConfiguration('daiguaTranslate.autoReload')) watchPacks();
    if (event.affectsConfiguration('daiguaTranslate.packPaths')) await reloadPacks();
    refreshStatus();
  }));
  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(invalidate),
    vscode.window.onDidChangeActiveTextEditor(invalidate),
    vscode.workspace.onDidChangeTextDocument(invalidate));
  // One provider owns explicit results in every language and automatic results in C/C++ only.
  context.subscriptions.push(vscode.languages.registerHoverProvider('*', {
    provideHover(document, position, token) {
      const sequence = ++hoverSequence;
      if (disposed) return;
      if (manual && manual.document === document && manual.version === document.version &&
          manual.epoch === epoch && (manual.range.contains(position) || manual.anchor.isEqual(position))) {
        return asHover(manual.text, manual.range);
      }
      if (!config().get<boolean>('localHover', true) || !['c', 'cpp'].includes(document.languageId)) return;
      const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
      if (!range) return;
      const value = document.getText(range);
      const entries = local.findLocalEntries(value);
      if (entries.length) return asHover('呆瓜 · 本地知识包\n' + formatEntries(entries), range);
      if (hoverMode() === 'off' || token.isCancellationRequested) return;
      const snapshot = { epoch, version: document.version };
      return local.query(value, hoverMode(), offline).then(text => {
        if (!text || disposed || token.isCancellationRequested || sequence !== hoverSequence ||
            snapshot.epoch !== epoch || snapshot.version !== document.version) return;
        return asHover(text.startsWith('呆瓜 · ') ? text : '呆瓜 · ' + text, range);
      }).catch(error => {
        if (!disposed && !token.isCancellationRequested && sequence === hoverSequence && snapshot.epoch === epoch && snapshot.version === document.version) {
          return asHover('呆瓜 · 翻译失败：' + String(error), range);
        }
      });
    },
  }));
  stop = () => {
    disposed = true;
    invalidate();
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
  return { translator: local };
}

export function deactivate() { stop?.(); stop = undefined; }
