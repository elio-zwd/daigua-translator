import * as vscode from 'vscode';
import * as path from 'path';
import { KnowledgePack } from './types';
import * as fs from 'fs';
import { QueryResult, errorResult } from './query-result';
import { HoverLocation, hoverMarkdown } from './result-renderer';
import { ReaderPanels } from './webviews';
import { OfflineDictionary, validateTerms } from './offline-dictionary';
import { DaiguaTranslate, TranslatorSettings } from './daigua-translate';
import { KnowledgeLoader, PackLoadReport, resolvePackPaths } from './knowledge-loader';
import { formatEntries, isLikelySingleSymbol, normalizeSymbol } from './symbol-matcher';
import { LibrarySnapshot, loadLibrary } from './library-catalog';
import { LibraryPreference } from './library-preference';

let stop: (() => void) | undefined;

interface MissingTermLocation {
  file: string;
  symbol: string;
  line: number;
}

const identifierPattern = /[A-Za-z_]\w*/;

export async function activate(context: vscode.ExtensionContext) {
  let loadedByPath = new Map<string, KnowledgePack>();
  let loadedPacks: KnowledgePack[] = [];
  let library: LibrarySnapshot | undefined;
  let reloadRequestId = 0;
  let pendingReload: Promise<PackLoadReport | null> | undefined;
  let disposed = false;
  let report: PackLoadReport | undefined;
  let loadedAt = '';
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let watchers: vscode.Disposable[] = [];
  const output = vscode.window.createOutputChannel('呆瓜翻译器');
  const readPrompt = (name: string) => fs.promises.readFile(path.join(__dirname, '../resources', name), 'utf8')
    .catch(error => { output.appendLine('[提示词加载失败] ' + String(error)); return undefined; });
  const [aiHandoff, missingTermsTemplate] = await Promise.all([
    readPrompt('external-ai-handoff.md'), readPrompt('missing-terms-handoff.md'),
  ]);
  const storagePath = context.globalStorageUri?.fsPath;
  const missingTermsFile = storagePath && path.isAbsolute(storagePath) ? path.join(storagePath, 'missing-terms.jsonl') : undefined;
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = 'daiguaTranslate.quickSettings';
  const config = () => vscode.workspace.getConfiguration('daiguaTranslate');
  const directoryPreference = new LibraryPreference(config, { global: context.globalState, workspace: context.workspaceState },
    message => output.appendLine('[目录设置] ' + message));
  const libraryDirectory = () => directoryPreference.get();
  const settings = (): TranslatorSettings => ({
    bingEnabled: config().get<boolean>('bingEnabled', true),
    bingTimeoutMs: config().get<number>('bingTimeoutMs', 5000),
    includeParameters: config().get<boolean>('includeParameters', true),
  });
  const local = new DaiguaTranslate(() => loadedPacks, undefined, settings, () => ({
    documentPath: vscode.window.activeTextEditor?.document.uri?.fsPath, projects: library?.projects || [],
  }));
  const offline = new OfflineDictionary(() => ({
    dictionaryPath: libraryDirectory() ? library?.dictionaryPath || '' : config().get<string>('dictionaryPath', ''),
    technicalLibraryPaths: libraryDirectory() ? [] : config().get<string[]>('technicalLibraryPaths', []),
    termLibraries: libraryDirectory() ? [...(library?.words || []), ...(library?.naming || [])] : [],
  }), message => output.appendLine('[词典诊断] ' + message));
  let epoch = 0;
  let hoverSequence = 0;
  let hoverRequestSequence = 0;
  let hoverDataEpoch = 0;
  let commandSequence = 0;
  let manual: { document: vscode.TextDocument; version: number; anchor: vscode.Position;
    range: vscode.Range; result: QueryResult; epoch: number } | undefined;
  const invalidate = (dataChanged = true) => {
    ++epoch; ++hoverSequence; ++commandSequence;
    if (dataChanged) ++hoverDataEpoch;
    manual = undefined;
  };
  const hoverMode = (): 'online' | 'ecdict' | 'off' => {
    const mode = config().get<string>('hoverFallback', 'online');
    return mode === 'ecdict' || mode === 'off' ? mode : 'online';
  };
  const asHover = (result: QueryResult, range: vscode.Range, document: vscode.TextDocument) => {
    const location: HoverLocation | undefined = document.uri?.scheme === 'file' && range.start
      ? { uri: document.uri.toString(), version: document.version, line: range.start.line, character: range.start.character } : undefined;
    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown(hoverMarkdown(result, config().get<boolean>('debugMode', false), location));
    markdown.isTrusted = { enabledCommands: ['daiguaTranslate.openDetails', 'daiguaTranslate.openSettings'] };
    return new vscode.Hover(markdown, range);
  };
  function selectedText(editor = vscode.window.activeTextEditor) {
    if (!editor) return '';
    if (!editor.selection.isEmpty) return editor.document.getText(editor.selection);
    const word = editor.document.getWordRangeAtPosition(editor.selection.active, identifierPattern);
    return word ? editor.document.getText(word) : '';
  }

  function locateTerm(text: string, document?: vscode.TextDocument, range?: vscode.Range): MissingTermLocation | undefined {
    if (!document || !range?.start || !isLikelySingleSymbol(text) ||
        !['c', 'cpp'].includes(document.languageId) || document.uri?.scheme !== 'file' ||
        !path.isAbsolute(document.uri.fsPath)) return;
    const original = document.getText(range);
    const symbol = normalizeSymbol(text);
    if (!isLikelySingleSymbol(original) || normalizeSymbol(original) !== symbol) return;
    const leadingLines = (original.match(/^\s*/)?.[0].match(/\r\n|\r|\n/g) || []).length;
    return { file: document.uri.fsPath, symbol, line: range.start.line + leadingLines + 1 };
  }

  function locateSelection(text: string, editor = vscode.window.activeTextEditor) {
    if (!editor) return;
    const { document, selection } = editor;
    const range = selection.isEmpty ? document.getWordRangeAtPosition(selection.active, identifierPattern) : selection;
    return locateTerm(text, document, range);
  }

  function locateHover(text: string, value: unknown): MissingTermLocation | undefined {
    if (!value || typeof value !== 'object') return;
    const { uri, version, line, character } = value as Partial<HoverLocation>;
    if (typeof uri !== 'string' || typeof line !== 'number' || typeof character !== 'number' ||
        !Number.isSafeInteger(line) || !Number.isSafeInteger(character) || line < 0 || character < 0) return;
    const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri && doc.version === version);
    if (!document || line >= document.lineCount || character >= document.lineAt(line).text.length) return;
    const range = document.getWordRangeAtPosition(new vscode.Position(line, character), identifierPattern);
    return locateTerm(text, document, range);
  }

  function currentRecordingLibrary() {
    const directory = libraryDirectory();
    return !disposed && !pendingReload && directory && library && !library.failures.length &&
      path.resolve(directory) === library.directory && config().get<boolean>('recordMissingTerms', false)
      ? library : undefined;
  }

  async function recordMissing(result: QueryResult, location?: MissingTermLocation) {
    if (!missingTermsFile || !location || result.text !== location.symbol || result.kind === 'error' ||
        result.kind === 'general' && result.match === 'exact' ||
        result.candidates.some(candidate => candidate.relation === 'current')) return;
    const snapshot = currentRecordingLibrary();
    if (!snapshot) return;
    try {
      const { file, symbol } = location;
      if (!settings().includeParameters && local.sourceResult(symbol, file, true)?.candidates.some(candidate => candidate.relation === 'current')) return;
      if (await offline.hasExactWord(symbol) ||
          result.kind === 'project' && (await offline.generalResult(symbol))?.match === 'exact') return;
      if (!(await fs.promises.stat(file)).isFile()) return;
      await fs.promises.mkdir(path.dirname(missingTermsFile), { recursive: true });
      if (snapshot !== currentRecordingLibrary()) return;
      await fs.promises.appendFile(missingTermsFile, JSON.stringify(location) + '\n', 'utf8');
    } catch (error) {
      output.appendLine('[待补词条记录失败] ' + String(error));
    }
  }

  async function display(result: QueryResult, editor: vscode.TextEditor | undefined,
    snapshot: { version: number; anchor: vscode.Position; epoch: number; request: number }, location?: MissingTermLocation) {
    if (disposed || snapshot.epoch !== epoch || snapshot.request !== commandSequence) return;
    if (!editor) { panels.showReader(result); return; }
    if (vscode.window.activeTextEditor !== editor || editor.document.version !== snapshot.version ||
        !editor.selection.active.isEqual(snapshot.anchor)) return;
    const range = editor.document.getWordRangeAtPosition(snapshot.anchor) || new vscode.Range(snapshot.anchor, snapshot.anchor);
    manual = { document: editor.document, version: snapshot.version, anchor: snapshot.anchor, range, result, epoch };
    if (panels.follows) panels.setResult(result);
    await vscode.commands.executeCommand('editor.action.showHover');
    if (snapshot.epoch === epoch && snapshot.request === commandSequence) await recordMissing(result, location);
  }
  async function translateInput(input: boolean) {
    const content = input ? await vscode.window.showInputBox({ title: '呆瓜翻译器：输入文本翻译',
      prompt: '输入名称或普通文本（最多 1000 字符）', value: selectedText(),
      validateInput: text => text.length > 1000 ? '单次最多 1000 字符' : undefined }) : selectedText();
    if (content === undefined || !content.trim()) return;
    const editor = vscode.window.activeTextEditor;
    const snapshot = { version: editor?.document.version || 0, anchor: editor?.selection.active!, epoch, request: ++commandSequence };
    const location = locateSelection(content, editor);
    manual = undefined;
    try {
      const result = await local.queryResult(content, 'online', offline, undefined, partial => {
        if (disposed || snapshot.epoch !== epoch || snapshot.request !== commandSequence) return;
        if (!editor) { panels.showReader(partial); return; }
        if (vscode.window.activeTextEditor === editor && editor.document.version === snapshot.version &&
            editor.selection.active.isEqual(snapshot.anchor) && panels.follows) panels.setResult(partial);
      });
      if (result) { logResult(result); await display(result, editor, snapshot, location); }
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
    bingTimeoutMs: 5000, libraryDirectory: '', packPaths: [], technicalLibraryPaths: [], dictionaryPath: '' };
  const panels = new ReaderPanels(debugMode, () => ({
    aiHandoff: aiHandoff?.replace('{{LIBRARY_DIRECTORY}}', () => libraryDirectory() || '（未设置，请填写含 library.json 的词库目录）'),
    missingTermsHandoff: missingTermsFile && libraryDirectory() ? missingTermsTemplate?.replace(
      /\{\{(LIBRARY_DIRECTORY|MISSING_TERMS_FILE)\}\}/g,
      (_token, key: string) => key === 'LIBRARY_DIRECTORY' ? path.resolve(libraryDirectory()) : missingTermsFile,
    ) : undefined,
    libraryCounts: library?.counts,
    libraryErrors: library?.failures.length || report?.failures.length || 0,
    values: { ...Object.fromEntries(Object.entries(defaultValues).map(([k, v]) => [k, k === 'libraryDirectory' ? libraryDirectory() : config().get(k, v)])),
      recordMissingTerms: config().get<boolean>('recordMissingTerms', false) },
    scope: vscode.workspace.workspaceFolders?.length ? '当前工作区' : '用户设置', count: countEntries(),
    packs: config().get<string[]>('packPaths', []).map(file => ({ path: file,
      status: report?.failures.some(f => f.path === path.resolve(file))
        ? (report.failures.find(f => f.path === path.resolve(file))!.retained ? '加载失败，保留上次内容' : '加载失败，查看诊断')
        : loadedByPath.has(path.resolve(file)) ? '已加载' : '等待加载' })),
  }), settingsAction, schedulePanel);
  panels.setLearningProvider(result => offline.panelLearning(result));
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
    const word = editor.document.getWordRangeAtPosition(editor.selection.active, identifierPattern);
    if (!word) { panels.setResult(); return; }
    const value = editor.document.getText(word), version = editor.document.version, currentEpoch = epoch;
    panelTimer = setTimeout(async () => {
      if (!panels.follows || disposed || sequence !== panelSequence) return;
      const isCurrent = () => !disposed && panels.follows && sequence === panelSequence && currentEpoch === epoch &&
        editor.document.version === version && vscode.window.activeTextEditor === editor;
      const source = local.sourceResult(value, editor.document.uri?.fsPath);
      if (source && isCurrent()) panels.setResult(source);
      let result: QueryResult | undefined;
      try { result = await local.queryResult(value, hoverMode(), offline, editor.document.uri?.fsPath,
        partial => { if (isCurrent()) panels.setResult(partial); }); }
      catch (error) { output.appendLine(String(error)); result = errorResult(value, error); }
      if (!isCurrent()) return;
      if (result) logResult(result);
      panels.setResult(result);
    }, 350);
  }
  async function openDetails(content?: unknown, hoverLocation?: unknown) {
    const text = typeof content === 'string' ? content : selectedText();
    if (typeof content === 'string' && content.length > 1000) return;
    const location = hoverLocation === undefined ? locateSelection(text) : locateHover(text, hoverLocation);
    panels.showReader();
    if (!text.trim()) { schedulePanel(); return; }
    const sequence = ++panelSequence, currentEpoch = epoch;
    if (panelTimer) clearTimeout(panelTimer);
    const source = local.sourceResult(text, location?.file);
    if (source) panels.setResult(source);
    try {
      const result = await local.queryResult(text, 'online', offline, location?.file, partial => {
        if (!disposed && panels.isOpen && sequence === panelSequence && currentEpoch === epoch) panels.setResult(partial);
      });
      if (result && !disposed && panels.isOpen && sequence === panelSequence && currentEpoch === epoch) {
        logResult(result); panels.setResult(result);
        await recordMissing(result, location);
      }
    } catch (error) {
      output.appendLine(String(error));
      if (!disposed && panels.isOpen && sequence === panelSequence && currentEpoch === epoch) panels.setResult(errorResult(text, error));
    }
  }
  async function settingsAction(message: Record<string, unknown>): Promise<string | void> {
    const key = message.key;
    let notice: string | undefined;
    if (message.action === 'set' && typeof key === 'string') {
      const value = message.value;
      const bools = ['localHover', 'bingEnabled', 'showStatusBar', 'autoReload', 'includeParameters', 'debugMode'];
      if (key === 'recordMissingTerms' && typeof value === 'boolean') {
        await config().update(key, value, vscode.ConfigurationTarget.Global);
      } else if (bools.includes(key) && typeof value === 'boolean' || key === 'hoverFallback' && ['online','ecdict','off'].includes(value as string) ||
          key === 'bingTimeoutMs' && typeof value === 'number' && Number.isFinite(value) && value >= 100 && value <= 30000) {
        await config().update(key, value, settingTarget());
      } else throw Error('设置值无效');
    } else if ((message.action === 'choose' || message.action === 'remove') && key === 'libraryDirectory') {
      if (message.action === 'remove') {
        await directoryPreference.save('');
        await reloadPacks();
        notice = '已移除词库目录；仅兼容读取旧配置中明确指定的文件。';
      } else {
        const selected = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
          title: '选择含 library.json 的词库目录', openLabel: '使用此词库目录' });
        if (!selected?.length) return '已取消选择。';
        const candidate = await loadLibrary(selected[0].fsPath);
        if (candidate.failures.length) throw Error(candidate.failures.map(f => `${f.path}：${f.reason}`).join('\n') + '\n当前配置未修改。');
        await directoryPreference.save(selected[0].fsPath);
        await reloadPacks();
        notice = `已加载词库目录：词语 ${candidate.counts.words} 条，命名 ${candidate.counts.naming} 条，源码 ${candidate.counts.symbols} 条。`;
      }
    } else if ((message.action === 'choose' || message.action === 'remove') &&
        typeof key === 'string' && ['packPaths','technicalLibraryPaths','dictionaryPath'].includes(key)) {
      if (message.action === 'remove') {
        if (!Number.isSafeInteger(message.index) || (message.index as number) < 0) return;
        if (key === 'dictionaryPath') await config().update(key, '', settingTarget());
        else await config().update(key, config().get<string[]>(key, []).filter((_, i) => i !== message.index), settingTarget());
        notice = '已移除，立即生效。';
      } else {
        const files = await vscode.window.showOpenDialog({ canSelectFolders: key === 'dictionaryPath',
          canSelectFiles: key !== 'dictionaryPath', canSelectMany: key !== 'dictionaryPath',
          title: key === 'dictionaryPath' ? '选择含 manifest.json 的词典目录' : '添加词库 JSON',
          filters: key === 'dictionaryPath' ? undefined : { '词库 JSON': ['json'] } });
        if (!files?.length) return '已取消选择。';
        if (key === 'dictionaryPath') {
          const manifest = JSON.parse((await fs.promises.readFile(path.join(files[0].fsPath, 'manifest.json'), 'utf8')).replace(/^\uFEFF/, ''));
          if (manifest.format_version !== 1 || !manifest.shards || !/^[a-f0-9]{64}$/i.test(manifest.source_sha256)) throw Error('词典索引格式不兼容');
          await config().update(key, files[0].fsPath, settingTarget());
          notice = '已设置离线词典目录，立即生效。';
        } else {
          let termCount = 0;
          if (key === 'packPaths') {
            const next = await new KnowledgeLoader().loadWithReport(files.map(f => f.fsPath));
            if (next.failures.length) throw Error(next.failures.map(f => `${f.path}：${f.reason}`).join('\n') + '\n当前配置未修改。');
          } else for (const file of files) {
            try { termCount += validateTerms(JSON.parse((await fs.promises.readFile(file.fsPath, 'utf8')).replace(/^\uFEFF/, ''))).length; }
            catch (error) {
              const reason = `${file.fsPath}：${error instanceof Error ? error.message : String(error)}`;
              output.appendLine('[添加通用技术库失败] ' + reason);
              throw Error(reason + '\n当前配置未修改。');
            }
          }
          const previous = config().get<string[]>(key, []);
          const next = [...new Set([...previous, ...files.map(f => f.fsPath)])];
          await config().update(key, next, settingTarget());
          notice = next.length === previous.length ? '所选文件已在列表中，已重新加载。'
            : key === 'technicalLibraryPaths' ? `已添加 ${next.length - previous.length} 个通用技术库；所选文件共 ${termCount} 条词条，立即生效。`
              : `已添加 ${next.length - previous.length} 个项目知识包，立即生效。`;
          // Selecting an existing file also reloads its edited contents.
          if (next.length === previous.length) await reloadPacks();
        }
      }
    } else if (message.action === 'reload') await reloadPacks(true);
    else if (message.action === 'diagnostics') showStatus();
    else if (message.action === 'nativeSettings') await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:elio-zwd.daigua-translator');
    panels.refresh();
    return notice;
  }

  function refreshStatus() {
    const errors = report?.failures.length || 0;
    const total = library ? library.counts.words + library.counts.naming + library.counts.symbols : countEntries();
    status.text = `$(book) 呆瓜 ${total}条 · ${settings().bingEnabled ? 'Bing 开' : '仅本地'}${errors ? ' $(warning)' : ''}`;
    status.tooltip = `知识包 ${loadedPacks.length} 个，词条 ${countEntries()} 条\n` +
      (library ? `词语 ${library.counts.words} 条，命名 ${library.counts.naming} 条，源码 ${library.counts.symbols} 条\n` : '') +
      `悬停模式：${hoverMode()}；词典：${(libraryDirectory() ? library?.dictionaryPath : config().get<string>('dictionaryPath', '')) || '未配置'}\n` +
      `最近加载：${loadedAt || '尚未完成'}${errors ? `\n加载失败 ${errors} 项（点击查看诊断）` : ''}\n点击打开快捷设置`;
    if (config().get<boolean>('showStatusBar', true)) status.show(); else status.hide();
    panels.refresh();
  }

  function showStatus() {
    const cfg = config();
    const scopes = cfg.inspect<string[]>('packPaths');
    output.appendLine(`\n=== 呆瓜翻译器加载诊断 ${new Date().toLocaleString()} ===`);
    output.appendLine(`插件版本：${context.extension.packageJSON.version}`);
    output.appendLine(`词库目录：${libraryDirectory() || '未选择（旧配置兼容模式，无内置数据）'}`);
    output.appendLine(directoryPreference.diagnostics());
    if (library) {
      output.appendLine(`分类计数：${JSON.stringify(library.counts)}`);
      for (const project of library.projects) output.appendLine(`[工程] ${project.id} ${project.name} | ${JSON.stringify(project.source_roots)}`);
      for (const failure of library.failures) output.appendLine(`[词库失败] ${failure.path} | ${failure.reason} | 保留旧内容：${failure.retained}`);
    }
    const hasDirectory = !!libraryDirectory();
    output.appendLine(`悬停模式：${hoverMode()}；ECDICT：${(hasDirectory ? library?.dictionaryPath : cfg.get<string>('dictionaryPath', '')) || '未配置'}；旧版技术库：${JSON.stringify(hasDirectory ? [] : cfg.get<string[]>('technicalLibraryPaths', []))}`);
    if (libraryDirectory()) output.appendLine(`当前生效路径：${JSON.stringify(library?.files || [])}`);
    else {
      output.appendLine(`用户路径：${JSON.stringify(scopes?.globalValue || [])}`);
      output.appendLine(`工作区路径：${JSON.stringify(scopes?.workspaceValue || [])}`);
      output.appendLine(`当前生效路径：${JSON.stringify(cfg.get<string[]>('packPaths', []))}`);
    }
    output.appendLine(`最近完成加载：${loadedAt || '尚未完成'}；有效 ${countEntries()} 条词条`);
    for (const [file, pack] of loadedByPath) {
      output.appendLine(`[${report?.failures.some(f => f.path === file) ? '保留旧内容' : '已加载'}] ${file}\n  ${pack.name} v${pack.version}，${pack.entries.length} 条`);
    }
    for (const failure of report?.failures || []) output.appendLine(`[失败] ${failure.path}\n${failure.reason}`);
    output.appendLine(`Bing：${settings().bingEnabled ? '开启' : '关闭'}；等待上限 ${settings().bingTimeoutMs} ms；参数查询：${settings().includeParameters ? '开启' : '关闭'}`);
    output.show(true);
  }

  function reloadPacks(notify = false): Promise<PackLoadReport | null> {
    const current = performReloadPacks(notify);
    pendingReload = current;
    void current.then(() => { if (pendingReload === current) pendingReload = undefined; },
      () => { if (pendingReload === current) pendingReload = undefined; });
    return current;
  }

  async function performReloadPacks(notify: boolean): Promise<PackLoadReport | null> {
    invalidate();
    offline.reset();
    const requestId = ++reloadRequestId;
    const directory = libraryDirectory();
    if (directory) {
      const previous = library?.directory.toLowerCase() === path.resolve(directory).toLowerCase() ? library : undefined;
      if (!previous) {
        library = undefined; loadedByPath = new Map(); loadedPacks = [];
        if (panels.follows) panels.setResult();
      }
      let next: LibrarySnapshot | undefined;
      try { next = await loadLibrary(directory, previous); }
      catch (error) {
        if (disposed || requestId !== reloadRequestId) return null;
        if (previous) next = { ...previous, failures: [{ path: path.join(directory, 'library.json'), reason: String(error), retained: true }] };
        else {
          report = { byPath: new Map(), packs: [], loadedCount: 0, warnings: [], failures: [{ path: path.join(directory, 'library.json'), reason: String(error), retained: false }] };
          output.appendLine('[词库目录加载失败] ' + String(error));
          watchPacks(); refreshStatus(); schedulePanel();
          return report;
        }
      }
      if (disposed || requestId !== reloadRequestId) return null;
      library = next; loadedPacks = next!.packs;
      loadedByPath = new Map(loadedPacks.map(p => [p.origin!.libraryPath, p]));
      report = { byPath: loadedByPath, packs: loadedPacks, loadedCount: loadedPacks.length, failures: next!.failures, warnings: next!.warnings };
      loadedAt = new Date().toLocaleString(); invalidate(); offline.reset(); watchPacks(); refreshStatus(); schedulePanel();
      const summary = `词库已更新：词语 ${next!.counts.words} 条，命名 ${next!.counts.naming} 条，源码 ${next!.counts.symbols} 条。`;
      output.appendLine(summary);
      for (const warning of next!.warnings) output.appendLine('[音标诊断] ' + warning);
      for (const failure of next!.failures) output.appendLine(`[失败] ${failure.path}：${failure.reason}；保留旧内容：${failure.retained}`);
      if (next!.failures.length) void vscode.window.showWarningMessage(summary + ' 部分文件加载失败，详情见加载诊断。');
      else if (notify) void vscode.window.showInformationMessage(summary);
      return report;
    }
    library = undefined;
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
    watchPacks();
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
    const directory = libraryDirectory();
    const paths = directory ? (library?.files || [path.join(directory, 'library.json')]) : resolvePackPaths([
      ...config().get<string[]>('packPaths', []), ...config().get<string[]>('technicalLibraryPaths', []),
      ...(config().get<string>('dictionaryPath', '') ? [path.join(config().get<string>('dictionaryPath', ''), 'manifest.json')] : []),
    ]);
    const key = (file: string) => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);
    const files = new Set(paths.map(key));
    const onChange = (uri: vscode.Uri) => {
      if (disposed || !files.has(key(uri.fsPath))) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { void reloadPacks(); }, 250);
    };
    const bases = directory ? new Set([path.resolve(directory), ...paths.filter(file => !key(file).startsWith(key(directory) + path.sep)).map(file => path.dirname(file))])
      : new Set(paths.map(file => path.dirname(file)));
    for (const base of bases) {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(base, directory && key(base) === key(directory) ? '**/*' : '*'));
      watchers.push(watcher, watcher.onDidChange(onChange), watcher.onDidCreate(onChange), watcher.onDidDelete(onChange));
    }
  }

  async function choosePacks() {
    try {
      const notice = await settingsAction({ action: 'choose', key: 'libraryDirectory' });
      if (notice) void vscode.window.showInformationMessage(notice);
    } catch (error) {
      output.appendLine('[词库目录选择失败] ' + String(error));
      void vscode.window.showWarningMessage('词库目录无效，当前配置未修改。详情见加载诊断。');
    }
  }

  async function queryLocal() {
    const editor = vscode.window.activeTextEditor;
    const selection = editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection).trim() : '';
    const word = editor?.document.getWordRangeAtPosition(editor.selection.active);
    const value = selection || (word ? editor!.document.getText(word) : '');
    const symbol = await vscode.window.showInputBox({
      title: '呆瓜翻译器：本地查询（不联网）',
      prompt: '输入一个符号，例如 interval、worker 或 arg；本工程优先，其他工程最多 3 条', value,
      validateInput: text => /^[A-Za-z_]\w*(?:\s*\(\s*\))?$/.test(text.trim()) ? undefined : '请输入单个符号名称，可带空括号。',
    });
    if (symbol === undefined) return;
    const editorNow = vscode.window.activeTextEditor;
    const snapshot = { version: editorNow?.document.version || 0, anchor: editorNow?.selection.active!, epoch, request: ++commandSequence };
    const location = locateSelection(symbol, editorNow);
    const entries = local.findLocalEntries(symbol);
    output.appendLine(`\n[本地查询] ${symbol.trim()} | ${loadedPacks.length} 个包，${countEntries()} 条词条 | ${new Date().toLocaleString()}`);
    output.appendLine(entries.length ? `[本地命中 ${entries.length} 项]\n${formatEntries(entries)}` : '本地未命中。请检查生效路径、加载诊断及名称大小写；参数查询需在设置中开启。');
    const result = await local.queryResult(symbol, 'ecdict', offline) || { text: symbol.trim(), kind: 'error' as const, match: 'none' as const, candidates: [], diagnostics: [], message: '本地词库未收录此名称。' };
    await display(result, editorNow, snapshot, location);
  }

  for (const [name, callback] of Object.entries({ reloadPacks: () => reloadPacks(true), choosePacks, queryLocal, showStatus, quickSettings: () => panels.showSettings(), openSettings: () => panels.showSettings(), openDetails, translateSelection: () => translateInput(false), translateText: () => translateInput(true) })) {
    context.subscriptions.push(vscode.commands.registerCommand(`daiguaTranslate.${name}`, callback));
  }
  context.subscriptions.push(output, status, vscode.workspace.onDidChangeConfiguration(async event => {
    if (event.affectsConfiguration('daiguaTranslate.libraryDirectory')) await directoryPreference.reconcile();
    if (Object.keys(defaultValues).filter(key => key !== 'debugMode').some(key => event.affectsConfiguration('daiguaTranslate.' + key))) { invalidate(); offline.reset(); schedulePanel(); }
    if (event.affectsConfiguration('daiguaTranslate.autoReload')) watchPacks();
    if (['packPaths', 'technicalLibraryPaths', 'dictionaryPath', 'libraryDirectory'].some(k => event.affectsConfiguration('daiguaTranslate.' + k))) await reloadPacks();
    refreshStatus();
  }));
  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(() => { invalidate(false); schedulePanel(); }),
    vscode.window.onDidChangeActiveTextEditor(() => { invalidate(false); schedulePanel(); }),
    vscode.workspace.onDidChangeTextDocument(() => { invalidate(); schedulePanel(); }));
  // One provider owns explicit results in every language and automatic results in C/C++ only.
  context.subscriptions.push(vscode.languages.registerHoverProvider('*', {
    provideHover(document, position, token) {
      const sequence = ++hoverSequence;
      const requestSequence = ++hoverRequestSequence;
      if (disposed || token?.isCancellationRequested) return;
      if (manual && manual.document === document && manual.version === document.version &&
          manual.epoch === epoch && (manual.range.contains(position) || manual.anchor.isEqual(position))) {
        const { result, range } = manual;
        if (result.onlineFailed) manual = undefined;
        return asHover(result, range, document);
      }
      if (!config().get<boolean>('localHover', true) || !['c', 'cpp'].includes(document.languageId)) return;
      const range = document.getWordRangeAtPosition(position, identifierPattern);
      if (!range) return;
      const value = document.getText(range);
      const source = local.sourceResult(value, document.uri?.fsPath);
      if ((!source && hoverMode() === 'off') || token.isCancellationRequested) return;
      const snapshot = { epoch, version: document.version, dataEpoch: hoverDataEpoch };
      return (async () => {
        let dataEpoch = snapshot.dataEpoch;
        for (let attempt = 0; attempt < 3; attempt++) {
          const result = await local.queryResult(value, hoverMode(), offline, document.uri?.fsPath);
          if (disposed || token.isCancellationRequested || snapshot.version !== document.version) return;
          if (source) {
            if (requestSequence !== hoverRequestSequence || !config().get<boolean>('localHover', true)) return;
            if (dataEpoch !== hoverDataEpoch) {
              if (attempt === 2) return;
              if (pendingReload) await pendingReload;
              dataEpoch = hoverDataEpoch;
              continue;
            }
          } else if (sequence !== hoverSequence || snapshot.epoch !== epoch) return;
          if (!result) return;
          logResult(result);
          return asHover(result, range, document);
        }
      })().catch(error => {
        if (!disposed && !token.isCancellationRequested && sequence === hoverSequence && snapshot.epoch === epoch && snapshot.version === document.version) {
          output.appendLine(String(error));
          return asHover(errorResult(value, error), range, document);
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
    library = undefined;
    offline.reset();
  };
  context.subscriptions.push({ dispose: stop });
  await directoryPreference.reconcile();
  watchPacks();
  await reloadPacks();
  return { translator: local, panels };
}

export function deactivate() { stop?.(); stop = undefined; }
