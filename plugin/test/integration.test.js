const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { DaiguaTranslate } = require('../out/daigua-translate');

function pack(label) {
  return {
    name: 'test', version: '1', source_version: 'test',
    entries: [{ symbol: 'Motor_Start', kind: 'function', name_zh: label,
      description_zh: '来自本地词条', declaration: 'void Motor_Start(void)',
      parameters: [], returns_zh: '无', scope: 'motor',
      source: { file: 'motor.c', line: 1 }, uncertainty: '' }]
  };
}

function vscodeMock(paths) {
  const definitions = Object.assign({}, ...require('../package.json').contributes.configuration.map(g => g.properties));
  const memento = () => {
    const values = new Map();
    return { get: key => values.get(key), update: async (key, value) => { if (value === undefined) values.delete(key); else values.set(key, value); } };
  };
  const state = {
    globalState: memento(), workspaceState: memento(), missingKeys: new Set(),
    values: { packPaths: paths }, source: 'elio-zwd.daigua-translator-daigua',
    messages: { info: [], warning: [], log: [] }, commands: new Map(), watchers: [],
    panels: [], hover: undefined, dialog: undefined, input: undefined, status: {}, updates: [], executions: [],
  };
  let change;
  const disposable = () => ({ dispose() {} });
  state.fireSettings = name => change({ affectsConfiguration: section => section === name || name.startsWith(section + '.') });
  state.vscode = {
    ViewColumn: { Active: -1, Beside: -2 }, env: { clipboard: { writeText: async text => { state.copied = text; } } },
    ConfigurationTarget: { Global: 1, Workspace: 2 }, StatusBarAlignment: { Right: 2 },
    RelativePattern: class { constructor(base, pattern) { this.base = base; this.pattern = pattern; } },
    Position: class { constructor(line, character) { this.line = line; this.character = character; } },
    MarkdownString: class {
      value = ''; appendMarkdown(text) { this.value += text; return this; }
      appendText(text) { this.value += text; return this; }
    },
    Hover: class { constructor(contents, range) { this.contents = contents; this.range = range; } },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
      textDocuments: [],
      getConfiguration: section => ({
        get: (key, fallback) => section === 'mtrancode' ? state.source : (state.values[key] ?? fallback),
        inspect: key => state.missingKeys.has(key) ? undefined : ({ defaultValue: definitions[section + '.' + key]?.default, workspaceValue: state.values[key] }),
        update: async (key, value, target) => {
          if (state.missingKeys.has(key)) throw Error(`CodeExpectedError: 没有注册配置 ${section}.${key}，因此无法写入 用户设置。`);
          state.updates.push({ section, key, value, target });
          if (section === 'mtrancode') state.source = value; else state.values[key] = value;
          await state.fireSettings(`${section}.${key}`);
        },
      }),
      onDidChangeConfiguration: cb => { change = cb; return disposable(); },
      onDidChangeTextDocument: cb => { state.changeDocument = cb; return disposable(); },
      createFileSystemWatcher: pattern => {
        const watcher = { pattern, disposed: false, callbacks: {}, dispose() { this.disposed = true; } };
        for (const name of ['Change', 'Create', 'Delete']) {
          watcher[`onDid${name}`] = cb => { watcher.callbacks[name] = cb; return disposable(); };
        }
        state.watchers.push(watcher);
        return watcher;
      },
    },
    languages: { registerHoverProvider: (languages, provider) => { state.hover = provider; return disposable(); } },
    commands: {
      registerCommand: (name, callback) => { state.commands.set(name, callback); return disposable(); },
      executeCommand: async name => { state.executions.push(name); },
    },
    window: {
      createWebviewPanel: (type, title, column, options) => {
        const p = { type, title, column, options, visible: true, messages: [],
          webview: { html: '', postMessage: async m => { p.messages.push(m); return true; },
            onDidReceiveMessage: cb => { p.receive = cb; return disposable(); } },
          onDidDispose: cb => { p.close = cb; return disposable(); },
          onDidChangeViewState: cb => { p.view = cb; return disposable(); },
          reveal() { p.visible = true; }, dispose() { p.visible = false; p.close?.(); } };
        state.panels.push(p); return p;
      },
      onDidChangeTextEditorSelection: cb => { state.changeSelection = cb; return disposable(); },
      onDidChangeActiveTextEditor: cb => { state.changeEditor = cb; return disposable(); },
      showInformationMessage: msg => state.messages.info.push(msg),
      showWarningMessage: msg => state.messages.warning.push(msg),
      showOpenDialog: async () => state.dialog,
      showInputBox: async () => state.input,
      showQuickPick: async items => items.find(item => item.label.includes(state.pick)),
      createStatusBarItem: () => Object.assign(state.status, { show() {}, hide() {}, dispose() {} }),
      createOutputChannel: () => ({ appendLine: msg => state.messages.log.push(msg), show() {}, dispose() {} }),
    },
  };
  return state;
}

test('local matching is offline, case-sensitive, and accepts trailing ()', async () => {
  let calls = 0;
  const translator = new DaiguaTranslate([pack('启动电机')], async () => {
    calls++;
    return { translation: 'fallback' };
  });
  assert.match(await translator.translate(' Motor_Start() ', {}), /启动电机/);
  assert.equal(calls, 0);
  assert.equal(await translator.translate('motor_start', {}), 'fallback');
  assert.equal(calls, 1);
});

test('an existing translator uses new pack snapshot', async () => {
  let current = [pack('旧版本')];
  const translator = new DaiguaTranslate(() => current, async () => {
    throw new Error('local hit must be offline');
  });
  assert.match(await translator.translate('Motor_Start', {}), /旧版本/);
  current = [pack('新版本')];
  assert.match(await translator.translate('Motor_Start', {}), /新版本/);
});

test('ambiguous local symbols show every candidate', async () => {
  const translator = new DaiguaTranslate([pack('候选一'), pack('候选二')]);
  const result = await translator.translate('Motor_Start', {});
  assert.match(result, /找到 2 个同名符号说明/);
  assert.match(result, /候选一/);
  assert.match(result, /候选二/);
});

test('unmatched text passes unmodified to Bing using MTranCode language mapping', async () => {
  const calls = [];
  const translator = new DaiguaTranslate([pack('本地')], async (...args) => {
    calls.push(args);
    return { translation: '完整译文' };
  });
  const input = 'Explain Motor_Start() and this sentence';
  assert.equal(await translator.translate(input, { from: 'auto', to: 'zh-CN' }), '完整译文');
  assert.deepEqual(calls, [[input, 'auto-detect', 'zh-Hans']]);
});

test('Bing errors and invalid results must reject', async () => {
  const failure = new DaiguaTranslate([], async () => { throw new Error('offline'); });
  await assert.rejects(failure.translate('unknown', {}), /offline/);
  for (const result of [{ translation: '' }, {}]) {
    const translator = new DaiguaTranslate([], async () => result);
    await assert.rejects(translator.translate('unknown', {}), /Bing 未返回有效译文/);
  }
});

test('independent extension keeps the same translator alive across reload', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daigua-'));
  const file = path.join(dir, 'pack.json');
  fs.writeFileSync(file, JSON.stringify(pack('初始释义')));
  const mock = vscodeMock([file]);
  const { vscode, commands } = mock;
  const originalLoad = Module._load;
  let extension;
  try {
    Module._load = function(request) {
      if (request === 'vscode') return vscode;
      return originalLoad.apply(this, arguments);
    };
    delete require.cache[require.resolve('../out/extension')];
    delete require.cache[require.resolve('../out/webviews')];
    extension = require('../out/extension');
  } finally {
    Module._load = originalLoad;
  }
  try {
    const exports = await extension.activate({ subscriptions: [], globalState: mock.globalState, workspaceState: mock.workspaceState, extension: { packageJSON: { version: '0.3.0' } } });
    const translator = exports.translator;
    assert.equal(exports.extendTranslate, undefined);
    assert.match(await translator.translate('Motor_Start', {}), /初始释义/);
    fs.writeFileSync(file, JSON.stringify(pack('重新加载的新释义')));
    await commands.get('daiguaTranslate.reloadPacks')();
    assert.match(await translator.translate('Motor_Start', {}), /重新加载的新释义/);
    const file2 = path.join(dir, 'other.json');
    fs.writeFileSync(file2, JSON.stringify(pack('配置更改后的释义')));
    mock.values.packPaths = [file2];
    await mock.fireSettings('daiguaTranslate.packPaths');
    assert.match(await translator.translate('Motor_Start', {}), /配置更改后的释义/);
  } finally {
    extension.deactivate();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


async function extensionHarness(paths, withTerms = true, storageDirectory) {
  const mock = vscodeMock(paths);
  if (withTerms) mock.values.technicalLibraryPaths = require('../../tests/fixtures/library-paths.cjs');
  const { vscode, messages, commands } = mock;
  const originalLoad = Module._load;
  let extension;
  try {
    Module._load = function(request) {
      if (request === 'vscode') return vscode;
      return originalLoad.apply(this, arguments);
    };
    delete require.cache[require.resolve('../out/extension')];
    delete require.cache[require.resolve('../out/webviews')];
    extension = require('../out/extension');
  } finally { Module._load = originalLoad; }
  const globalStorageUri = storageDirectory && { scheme: 'file', fsPath: storageDirectory };
  const api = await extension.activate({ subscriptions: [], globalStorageUri, globalState: mock.globalState, workspaceState: mock.workspaceState, extension: { packageJSON: { version: '0.3.0' } } });
  const translator = api.translator;
  translator.bingTranslator = async () => ({ translation: 'fallback' });
  return { translator, panels: api.panels, messages, mock, commands, dispose: () => extension.deactivate(),
    reload: () => commands.get('daiguaTranslate.reloadPacks')(),
    paths: next => { mock.values.packPaths = next; return mock.fireSettings('daiguaTranslate.packPaths'); } };
}

test('bad reload warns concisely, retains last valid pack, and forgets removed paths', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daigua-errors-'));
  const file = path.join(dir, 'a.json');
  fs.writeFileSync(file, JSON.stringify(pack('有效旧释义')));
  const harness = await extensionHarness([file]);
  try {
    fs.writeFileSync(file, '{broken');
    await harness.reload();
    assert.match(await harness.translator.translate('Motor_Start', {}), /有效旧释义/);
    assert.equal(harness.messages.info.length, 0);
    assert.match(harness.messages.warning[0], /保留旧包 1/);
    assert.ok(!harness.messages.warning[0].includes(file));
    assert.ok(harness.messages.log.join("\n").includes(file));
    assert.match(harness.messages.log.join('\n'), /首次|保留上一次有效内容/);
    await harness.paths([]);
    assert.equal(await harness.translator.translate('Motor_Start', {}), 'fallback');
    await harness.paths([file]);
    assert.equal(await harness.translator.translate('Motor_Start', {}), 'fallback');
    fs.writeFileSync(file, JSON.stringify(pack('修复的新释义')));
    await harness.reload();
    assert.match(await harness.translator.translate('Motor_Start', {}), /修复的新释义/);
    assert.equal(harness.messages.info.length, 1);
  } finally { harness.dispose(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('slow older reload never wins; removed packs disappear while the next read is pending', async () => {
  const { KnowledgeLoader } = require('../out/knowledge-loader');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daigua-race-'));
  const file = path.join(dir, 'a.json'), other = path.join(dir, 'b.json');
  fs.writeFileSync(file, JSON.stringify(pack('初始')));
  fs.writeFileSync(other, JSON.stringify(pack('最新')));
  const harness = await extensionHarness([file]);
  const original = KnowledgeLoader.prototype.loadWithReport;
  let release;
  try {
    KnowledgeLoader.prototype.loadWithReport = async function(paths, previous) {
      const report = await original.call(this, paths, previous);
      if (paths[0] === file) await new Promise(resolve => { release = resolve; });
      return report;
    };
    fs.writeFileSync(file, JSON.stringify(pack('过期结果')));
    const older = harness.reload();
    while (!release) await new Promise(resolve => setImmediate(resolve));
    // Second request prunes a synchronously, before reading b.
    const latest = harness.paths([other]);
    assert.equal(await harness.translator.translate('Motor_Start', {}), 'fallback');
    await latest;
    release();
    await older;
    assert.match(await harness.translator.translate('Motor_Start', {}), /最新/);
    assert.equal(harness.messages.info.length, 0, 'obsolete reload must not display success');
  } finally {
    if (release) release();
    KnowledgeLoader.prototype.loadWithReport = original;
    harness.dispose(); fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Bing switch takes effect for existing translators and never caches a disabled miss', async () => {
  let enabled = false, calls = 0;
  const translator = new DaiguaTranslate([pack('本地仍可用')], async () => {
    calls++;
    return { translation: 'online result' };
  }, () => ({ bingEnabled: enabled, bingTimeoutMs: 100, includeParameters: true }));
  assert.match(await translator.translate('Motor_Start', {}), /本地仍可用/);
  await assert.rejects(translator.translate('unknown', {}), /Bing 回退已关闭/);
  assert.equal(calls, 0);
  enabled = true;
  assert.equal(await translator.translate('unknown', {}), 'online result');
  assert.equal(calls, 1);
  enabled = false;
  await assert.rejects(translator.translate('unknown', {}), /Bing 回退已关闭/);
  assert.equal(calls, 1);
});

test('Bing shares an active attempt and starts a fresh request after timeout', async () => {
  const finishes = [];
  const translator = new DaiguaTranslate([], async () => {
    return new Promise(resolve => { finishes.push(resolve); });
  }, () => ({ bingEnabled: true, bingTimeoutMs: 100, includeParameters: true }));
  const a = assert.rejects(translator.translate('hello', {}), /等待超过 100 ms/);
  const b = assert.rejects(translator.translate('hello', {}), /等待超过 100 ms/);
  await Promise.all([a, b]);
  assert.equal(finishes.length, 1);
  const later = translator.translate('hello', {});
  assert.equal(finishes.length, 2);
  finishes[0]({ translation: '过期译文' });
  await new Promise(resolve => setImmediate(resolve));
  const concurrent = translator.translate('hello', {});
  assert.equal(finishes.length, 2, 'a late reply must not remove the active retry');
  finishes[1]({ translation: '你好' });
  assert.equal(await later, '你好');
  assert.equal(await concurrent, '你好');
  const after = translator.translate('hello', {});
  assert.equal(finishes.length, 3, 'completed results are not cached by this extension');
  finishes[2]({ translation: '新请求' });
  assert.equal(await after, '新请求');
});

test('parameters are searchable with function scope without mutating JSON; settings and reload invalidate index', async () => {
  const first = pack('初始');
  first.entries[0].parameters = [{ name: 'arg', description_zh: '任务周期指针' }];
  const second = pack('另一个函数');
  second.entries[0].symbol = 'Other_Start';
  second.entries[0].parameters = [{ name: 'arg', description_zh: '另一个参数' }];
  let packs = [first, second], includeParameters = true;
  const before = JSON.stringify(packs);
  const translator = new DaiguaTranslate(() => packs, async () => { throw Error('must not connect'); },
    () => ({ bingEnabled: false, bingTimeoutMs: 100, includeParameters }));
  const result = await translator.translate('arg', {});
  assert.match(result, /找到 2 个同名/);
  assert.match(result, /Motor_Start::参数/);
  assert.match(result, /Other_Start::参数/);
  assert.match(result, /任务周期指针/);
  assert.equal(JSON.stringify(packs), before);
  includeParameters = false;
  await assert.rejects(translator.translate('arg', {}), /回退已关闭/);
  includeParameters = true;
  packs = [pack('更新后')];
  assert.equal(translator.findLocalEntries('arg').length, 0);
  assert.match(await translator.translate('Motor_Start()', {}), /更新后/);
});

test('diagnostics expose effective paths and local query bypasses fallback; local hover is independently configurable', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daigua-diagnostics-'));
  const file = path.join(dir, 'pack.json');
  fs.writeFileSync(file, JSON.stringify(pack('诊断探针')));
  const harness = await extensionHarness([file]);
  try {
    harness.translator.bingTranslator = () => { throw Error('no network'); };
    await harness.commands.get('daiguaTranslate.showStatus')();
    assert.match(harness.messages.log.join('\n'), /插件版本：0.3.0/);
    assert.ok(harness.messages.log.some(line => line.includes('当前生效路径') && line.includes(file.replaceAll('\\', '\\\\'))));
    assert.match(harness.mock.status.text, /1条/);
    harness.mock.input = 'Motor_Start';
    await harness.commands.get('daiguaTranslate.queryLocal')();
    assert.match(harness.messages.log.join('\n'), /本地命中 1 项/);
    assert.match(harness.messages.log.join('\n'), /诊断探针/);
    harness.mock.input = 'not_in_pack';
    await harness.commands.get('daiguaTranslate.queryLocal')();
    assert.match(harness.messages.log.join('\n'), /本地未命中/);
    const document = { languageId: 'c', getWordRangeAtPosition: () => ({}), getText: () => 'Motor_Start' };
    const hover = await harness.mock.hover.provideHover(document, {}, { isCancellationRequested: false });
    assert.match(hover.contents.value, /源码释义/);
    assert.match(hover.contents.value, /诊断探针/);
    harness.mock.values.localHover = false;
    assert.equal(harness.mock.hover.provideHover(document, {}), undefined);
    await harness.commands.get('daiguaTranslate.quickSettings')();
    assert.match(harness.mock.panels.at(-1).webview.html, /日常使用/);
    await harness.mock.panels.at(-1).receive({ action: 'set', key: 'bingEnabled', value: false });
    await new Promise(r => setTimeout(r, 20));
    assert.match(harness.mock.status.text, /仅本地/);
    await assert.rejects(harness.translator.translate('new_unknown', {}), /回退已关闭/);
  } finally { harness.dispose(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('directory picker rejects invalid catalogs, saves global scope and supersedes legacy paths', async () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'daigua-directory-picker-'));
  const h=await extensionHarness([],false);
  try {
    h.mock.dialog=[{fsPath:directory}];
    await h.commands.get('daiguaTranslate.choosePacks')();
    assert.equal(h.mock.values.libraryDirectory,undefined);assert.equal(h.mock.updates.length,0);
    assert.match(h.messages.warning.at(-1),/当前配置未修改/);
    h.mock.dialog=[{fsPath:path.resolve(__dirname,'../../dictionaries')}];
    await h.commands.get('daiguaTranslate.choosePacks')();
    assert.equal(h.mock.updates.at(-1).target,1);
    assert.equal(h.mock.values.libraryDirectory,path.resolve(__dirname,'../../dictionaries'));
    const {document,position}=documentFixture('EK');
    h.mock.values.bingEnabled=false;
    const hover=await h.mock.hover.provideHover(document,position,{isCancellationRequested:false});
    assert.match(hover.contents.value,/熠日照明/);
    await h.paths([path.join(directory,'not-a-pack.json')]);
    assert.ok(!h.messages.warning.some(x=>x.includes('部分知识包加载失败')));
    await h.commands.get('daiguaTranslate.openSettings')();
    const view=h.mock.panels.at(-1);
    assert.match(view.webview.html,/词语释义库/);assert.ok(!view.webview.html.includes('legacy-libraries'));
    await view.receive({action:'remove',key:'libraryDirectory'});
    assert.equal(h.mock.values.libraryDirectory,'');
  } finally { h.dispose();fs.rmSync(directory,{recursive:true,force:true}); }
});

test('auto reload filters unrelated files, debounces edits, retains invalid edits and disposes watchers', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daigua-watcher-'));
  const file = path.join(dir, 'pack.json');
  fs.writeFileSync(file, JSON.stringify(pack('最初')));
  const harness = await extensionHarness([file]);
  try {
    const watcher = harness.mock.watchers.at(-1);
    const initialLogs = harness.messages.log.length;
    watcher.callbacks.Change({ fsPath: path.join(dir, 'unrelated.json') });
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(harness.messages.log.length, initialLogs);
    fs.writeFileSync(file, JSON.stringify(pack('自动刷新')));
    watcher.callbacks.Change({ fsPath: file });
    watcher.callbacks.Create({ fsPath: file });
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.match(await harness.translator.translate('Motor_Start', {}), /自动刷新/);
    assert.equal(harness.messages.log.filter(line => line.startsWith('呆瓜翻译器：加载成功')).length, 2);
    fs.writeFileSync(file, '{broken');
    watcher.callbacks.Change({ fsPath: file });
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.match(await harness.translator.translate('Motor_Start', {}), /自动刷新/);
    assert.match(harness.mock.status.text, /warning/);
    harness.mock.values.autoReload = false;
    await harness.mock.fireSettings('daiguaTranslate.autoReload');
    assert.ok(watcher.disposed);
  } finally {
    harness.dispose();
    assert.ok(harness.mock.watchers.every(watcher => watcher.disposed));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function documentFixture(text, languageId = 'c') {
  const position = { line: 0, character: 1, isEqual(other) { return this.line === other.line && this.character === other.character; } };
  const range = { contains: other => position.isEqual(other) };
  const document = { languageId, version: 1, getWordRangeAtPosition: () => range, getText: () => text };
  const editor = { document, selection: { isEmpty: true, active: position } };
  return { position, range, document, editor };
}

test('explicit translation uses one hover, works in non-C files with auto hover off, and does not edit text', async () => {
  const h = await extensionHarness([]);
  const { position, document, editor } = documentFixture('Motor_Start', 'plaintext');
  try {
    h.mock.vscode.window.activeTextEditor = editor;
    h.mock.values.localHover = false;
    h.mock.values.hoverFallback = 'off';
    await h.commands.get('daiguaTranslate.translateSelection')();
    assert.deepEqual(h.mock.executions, ['editor.action.showHover']);
    const hover = await h.mock.hover.provideHover(document, position, { isCancellationRequested: false });
    assert.match(hover.contents.value, /Motor[\s\S]*Start[\s\S]*fallback[\s\S]*联网翻译/);
    assert.equal(document.getText(), 'Motor_Start');
    h.mock.changeSelection();
    assert.equal(await h.mock.hover.provideHover(document, position, { isCancellationRequested: false }), undefined);
  } finally { h.dispose(); }
});

test('hovering again at the same position retries a failed explicit translation', async () => {
  const h = await extensionHarness([]);
  const { position, document, editor } = documentFixture('Unknown_Name');
  const token = { isCancellationRequested: false };
  let attempts = 0;
  try {
    h.mock.vscode.window.activeTextEditor = editor;
    h.translator.bingTranslator = async () => {
      if (++attempts === 1) throw Error('test network failure');
      return { translation: '重试成功' };
    };
    await h.commands.get('daiguaTranslate.translateSelection')();
    const firstHover = await h.mock.hover.provideHover(document, position, token);
    assert.match(firstHover.contents.value, /词语释义/);
    assert.equal(attempts, 1);

    const nextHover = await h.mock.hover.provideHover(document, position, token);
    assert.match(nextHover.contents.value, /重试成功/);
    assert.equal(attempts, 2);
  } finally { h.dispose(); }
});

test('input text without an editor uses the reader; offline sentence failure is readable', async () => {
  const h = await extensionHarness([]);
  try {
    h.mock.input = 'A generic sentence.';
    await h.commands.get('daiguaTranslate.translateText')();
    assert.match(h.mock.panels.at(-1).webview.html, /A generic sentence.[\s\S]*联网翻译/);
    h.mock.values.bingEnabled = false;
    await h.commands.get('daiguaTranslate.translateText')();
    assert.match(h.mock.panels.at(-1).messages.at(-1).html, /无法提供整句译文/);
    assert.equal(h.mock.executions.length, 0);
  } finally { h.dispose(); }
});

test('late manual translations do not display after document/settings/selection changes', async () => {
  for (const event of ['document', 'settings', 'selection']) {
    const h = await extensionHarness([]);
    const { editor } = documentFixture('Unknown_Name');
    let finish;
    try {
      h.mock.vscode.window.activeTextEditor = editor;
      h.translator.bingTranslator = () => new Promise(resolve => { finish = resolve; });
      const request = h.commands.get('daiguaTranslate.translateSelection')();
      await waitUntil(() => finish);
      if (event === 'document') { editor.document.version++; h.mock.changeDocument(); }
      if (event === 'settings') await h.mock.fireSettings('daiguaTranslate.bingEnabled');
      if (event === 'selection') h.mock.changeSelection();
      finish({ translation: '过期' });
      await request;
      assert.deepEqual(h.mock.executions, [], event);
    } finally { h.dispose(); }
  }
});

test('cancelled, superseded, edited or reconfigured automatic hover never shows stale online results', async () => {
  for (const event of ['cancel', 'supersede', 'edit', 'settings']) {
    const h = await extensionHarness([]);
    const { document, position } = documentFixture('Unknown_Name');
    let finish;
    const token = { isCancellationRequested: false };
    try {
      h.translator.bingTranslator = () => new Promise(resolve => { finish = resolve; });
      const request = h.mock.hover.provideHover(document, position, token);
      await waitUntil(() => finish);
      if (event === 'cancel') token.isCancellationRequested = true;
      if (event === 'supersede') { h.mock.values.hoverFallback = 'off'; h.mock.hover.provideHover(document, position, token); }
      if (event === 'edit') document.version++;
      if (event === 'settings') await h.mock.fireSettings('daiguaTranslate.hoverFallback');
      finish({ translation: '过期' });
      assert.equal(await request, undefined, event);
    } finally { h.dispose(); }
  }
});

test('source hover survives editor selection events but cancels stale data and requests', async () => {
  const { OfflineDictionary } = require('../out/offline-dictionary');
  const original = OfflineDictionary.prototype.pronunciationForSymbol;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daigua-source-hover-'));
  const file = path.join(directory, 'pack.json');
  fs.writeFileSync(file, JSON.stringify(pack('源码释义')));
  try {
    for (const event of ['selection','editor','settings','edit','cancel','supersede']) {
      const h = await extensionHarness([file]);
      const { document, position } = documentFixture('Motor_Start');
      const token = { isCancellationRequested:false };
      let release;
      try {
        OfflineDictionary.prototype.pronunciationForSymbol = () => new Promise(resolve => { release = resolve; });
        const request = h.mock.hover.provideHover(document, position, token);
        await waitUntil(() => release);
        if (event === 'selection') h.mock.changeSelection();
        if (event === 'editor') h.mock.changeEditor();
        if (event === 'settings') {
          h.mock.values.localHover = false;
          await h.mock.fireSettings('daiguaTranslate.localHover');
        }
        if (event === 'edit') document.version++;
        if (event === 'cancel') token.isCancellationRequested = true;
        if (event === 'supersede') { h.mock.values.localHover = false; h.mock.hover.provideHover(document, position, token); }
        release({segments:[{text:'Motor',reading:'word',phonetic:'motor',source:'fixture',status:'resolved'}]});
        const hover = await request;
        if (event === 'selection' || event === 'editor') assert.match(hover.contents.value, /源码释义/, event);
        else assert.equal(hover, undefined, event);
      } finally { h.dispose(); }
    }
  } finally {
    OfflineDictionary.prototype.pronunciationForSymbol = original;
    fs.rmSync(directory, {recursive:true,force:true});
  }
});

test('source hover retries with fresh data after configuration changes', async () => {
  const { OfflineDictionary } = require('../out/offline-dictionary');
  const original = OfflineDictionary.prototype.pronunciationForSymbol;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daigua-source-retry-'));
  const file = path.join(directory, 'pack.json');
  fs.writeFileSync(file, JSON.stringify(pack('源码释义')));
  const h = await extensionHarness([file]);
  const { document, position } = documentFixture('Motor_Start');
  let release, calls = 0;
  const reading = phonetic => ({segments:[{text:'Motor',reading:'word',phonetic,source:'fixture',status:'resolved'}]});
  try {
    OfflineDictionary.prototype.pronunciationForSymbol = () => ++calls === 1
      ? new Promise(resolve => { release = resolve; }) : Promise.resolve(reading('fresh'));
    const request = h.mock.hover.provideHover(document, position, {isCancellationRequested:false});
    await waitUntil(() => release);
    await h.mock.fireSettings('daiguaTranslate.bingEnabled');
    release(reading('stale'));
    const hover = await request;
    assert.match(hover.contents.value, /fresh/);
    assert.doesNotMatch(hover.contents.value, /stale/);
    assert.equal(calls, 2);
  } finally {
    OfflineDictionary.prototype.pronunciationForSymbol = original;
    h.dispose(); fs.rmSync(directory, {recursive:true,force:true});
  }
});

test('automatic off never calls Bing; dictionary mode and global-off use explicitly configured libraries', async () => {
  const h = await extensionHarness([]);
  const { document, position } = documentFixture('LED');
  let calls = 0;
  h.translator.bingTranslator = async () => { calls++; return { translation: 'unexpected' }; };
  try {
    h.mock.values.hoverFallback = 'off';
    assert.equal(await h.mock.hover.provideHover(document, position, { isCancellationRequested: false }), undefined);
    h.mock.values.hoverFallback = 'ecdict';
    assert.match((await h.mock.hover.provideHover(document, position, { isCancellationRequested: false })).contents.value, /发光二极管/);
    h.mock.values.hoverFallback = 'online'; h.mock.values.bingEnabled = false;
    assert.match((await h.mock.hover.provideHover(document, position, { isCancellationRequested: false })).contents.value, /发光二极管/);
    assert.equal(calls, 0);
  } finally { h.dispose(); }
});

async function waitUntil(predicate) {
  for (let i=0;i<100;i++) { if(predicate()) return; await new Promise(r=>setTimeout(r,10)); }
  assert.ok(predicate(), 'expected asynchronous operation to start');
}

test('reader follows only when open and unlocked; rapid selection changes debounce and closing stops work', async () => {
  const h=await extensionHarness([]);
  let queries=0;
  const query=h.translator.queryResult.bind(h.translator);
  h.translator.queryResult=async(...args)=>{queries++;return query(...args);};
  try {
    h.mock.vscode.window.activeTextEditor=documentFixture('course_board_init').editor;
    h.mock.changeSelection();
    await new Promise(r=>setTimeout(r,380));assert.equal(queries,0);
    await h.commands.get('daiguaTranslate.openDetails')();
    assert.equal(h.panels.result.text,'course_board_init');
    const reader=h.mock.panels.at(-1);
    await reader.receive({action:'lock'});
    h.mock.vscode.window.activeTextEditor=documentFixture('app_led_toggle').editor;h.mock.changeSelection();
    await new Promise(r=>setTimeout(r,380));assert.equal(queries,1);
    assert.equal(h.panels.result.text,'course_board_init');
    await reader.receive({action:'lock'});
    for(const word of ['app_uart_read','app_uart_write','app_led_set']) {
      h.mock.vscode.window.activeTextEditor=documentFixture(word).editor;h.mock.changeSelection();
    }
    await waitUntil(()=>h.panels.result.text==='app_led_set');assert.equal(queries,2);
    await reader.receive({action:'copy'});assert.equal(h.mock.copied,'app_led_set');
    h.mock.vscode.window.activeTextEditor=documentFixture('app_uart_write').editor;h.mock.changeSelection();
    reader.dispose();await new Promise(r=>setTimeout(r,380));assert.equal(queries,2);
  } finally {h.dispose();}
});

test('reader rejects late results after replacement, locking and closing', async () => {
  for(const action of ['replace','lock','close']) {
    const h=await extensionHarness([]);let finish;
    try {
      await h.commands.get('daiguaTranslate.openDetails')('board_init');
      const previous=h.panels.result;
      h.translator.bingTranslator=()=>new Promise(resolve=>{finish=resolve;});
      const request=h.commands.get('daiguaTranslate.openDetails')('Unknown_Name');
      await waitUntil(()=>finish);
      if(action==='replace') await h.commands.get('daiguaTranslate.openDetails')('led_set');
      if(action==='lock') await h.mock.panels.at(-1).receive({action:'lock'});
      if(action==='close') h.mock.panels.at(-1).dispose();
      finish({translation:'过期结果'});await request;
      assert.equal(h.panels.result.text,action==='replace'?'led_set':previous.text);
    }finally{h.dispose();}
  }
});

test('reader shows local components immediately, then adds whole-name Bing translation', async () => {
  const h = await extensionHarness([]);
  let finish;
  try {
    h.translator.bingTranslator = () => new Promise(resolve => { finish = resolve; });
    const request = h.commands.get('daiguaTranslate.openDetails')('sFLASH_LowLevel_Init');
    await waitUntil(() => finish && h.panels.result?.components?.length);
    assert.equal(h.panels.result.kind,'dictionary');
    assert.equal(h.panels.result.onlineTranslation,undefined);
    const initial = h.panels.result.components;
    finish({translation:'闪存底层初始化'});
    await request;
    assert.equal(h.panels.result.onlineTranslation,'闪存底层初始化');
    assert.deepEqual(h.panels.result.components,initial);
    const html = h.mock.panels.at(-1).messages.at(-1).html;
    assert.match(html,/联网翻译/); assert.match(html,/闪存底层初始化/); assert.match(html,/FLASH/);
  } finally { h.dispose(); }
});

test('late whole-name translation cannot update a replaced, locked, closed or disabled reader', async () => {
  for (const action of ['replace','lock','close','settings']) {
    const h = await extensionHarness([]);
    let finish;
    try {
      h.translator.bingTranslator = () => new Promise(resolve => { finish = resolve; });
      const request = h.commands.get('daiguaTranslate.openDetails')('sFLASH_LowLevel_Init');
      await waitUntil(() => finish && h.panels.result?.components?.length);
      const partial = h.panels.result;
      if (action === 'replace') await h.commands.get('daiguaTranslate.openDetails')('board_init');
      if (action === 'lock') await h.mock.panels.at(-1).receive({action:'lock'});
      if (action === 'close') h.mock.panels.at(-1).dispose();
      if (action === 'settings') { h.mock.values.bingEnabled = false; await h.mock.fireSettings('daiguaTranslate.bingEnabled'); }
      finish({translation:'过期译文'}); await request;
      assert.equal(h.panels.result.text,action === 'replace' ? 'board_init' : partial.text,action);
      assert.equal(h.panels.result.onlineTranslation,undefined,action);
    } finally { h.dispose(); }
  }
});

test('automatic hover includes whole-name translation alongside local components', async () => {
  const h=await extensionHarness([]);
  const {document,position}=documentFixture('sFLASH_LowLevel_Init');
  try {
    h.translator.bingTranslator=async()=>({translation:'闪存底层初始化'});
    const hover=await h.mock.hover.provideHover(document,position,{isCancellationRequested:false});
    assert.match(hover.contents.value,/联网翻译/); assert.match(hover.contents.value,/闪存底层初始化/);
    assert.match(hover.contents.value,/FLASH/); assert.match(hover.contents.value,/初始化/);
  } finally {h.dispose();}
});

test('settings page validates messages, saves scope, updates locked reader debug without querying again', async () => {
  const h=await extensionHarness([]);
  try {
    await h.commands.get('daiguaTranslate.openDetails')('uint16_t');
    const reader=h.mock.panels.at(-1);await reader.receive({action:'lock'});
    h.translator.queryResult=()=>{throw Error('must not requery for debug');};
    await h.commands.get('daiguaTranslate.openSettings')();
    const settings=h.mock.panels.at(-1);
    assert.match(settings.webview.html,/日常使用[\s\S]*词库管理[\s\S]*调试与诊断/);
    assert.match(settings.webview.html,/default-src 'none'/);
    await settings.receive({action:'set',key:'debugMode',value:true});
    assert.equal(h.mock.updates.at(-1).target,2);
    assert.match(reader.messages.at(-1).html,/AI-type-convention/);
    await settings.receive({action:'set',key:'bingTimeoutMs',value:-1});
    await settings.receive({action:'set',key:'packPaths',value:['bad']});
    await settings.receive({action:'set',key:'evil',value:true});
    assert.equal(h.mock.updates.length,1);
    assert.equal(settings.messages.at(-1).type,'notice');
    h.mock.vscode.workspace.workspaceFolders=[];
    await settings.receive({action:'set',key:'showStatusBar',value:false});
    assert.equal(h.mock.updates.at(-1).target,1);
    const count=h.mock.panels.length;
    await h.commands.get('daiguaTranslate.quickSettings')();assert.equal(h.mock.panels.length,count);
  }finally{h.dispose();}
});

test('settings path buttons append validated files, reject bad files and remove only the selected path', async () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'daigua-settings-path-'));
  const first=path.join(directory,'first.json'),second=path.join(directory,'second.json'),bad=path.join(directory,'bad.json');
  fs.writeFileSync(first,JSON.stringify(pack('第一个')));fs.writeFileSync(second,JSON.stringify(pack('第二个')));fs.writeFileSync(bad,'{}');
  const h=await extensionHarness([first], false);
  try {
    await h.commands.get('daiguaTranslate.openSettings')();const view=h.mock.panels.at(-1);
    h.mock.dialog=[{fsPath:bad}];await view.receive({action:'choose',key:'packPaths'});
    assert.deepEqual(h.mock.values.packPaths,[first]);assert.equal(view.messages.at(-1).type,'notice');
    h.mock.dialog=[{fsPath:second}];await view.receive({action:'choose',key:'packPaths'});
    assert.deepEqual(h.mock.values.packPaths,[first,second]);
    assert.match(view.messages.findLast(m=>m.type==='render').html,/已加载/);
    assert.match(view.messages.at(-1).text,/已添加 1 个项目知识包/);
    await view.receive({action:'remove',key:'packPaths',index:0});assert.deepEqual(h.mock.values.packPaths,[second]);
    h.mock.dialog=[{fsPath:bad}];await view.receive({action:'choose',key:'technicalLibraryPaths'});
    assert.equal(h.mock.values.technicalLibraryPaths,undefined);
    h.mock.dialog=[{fsPath:directory}];await view.receive({action:'choose',key:'dictionaryPath'});
    assert.equal(h.mock.values.dictionaryPath,undefined);
  }finally{h.dispose();fs.rmSync(directory,{recursive:true,force:true});}
});

test('DFU general library picker reports local success, duplicates, cancellation and validation errors across refreshes', async () => {
  const file = path.resolve(__dirname, '../../knowledge-packs/dfu-20261110/general-terms.json');
  const h = await extensionHarness([], false);
  try {
    await h.commands.get('daiguaTranslate.openSettings')();
    const view = h.mock.panels.at(-1);
    h.mock.dialog = [{fsPath:file}];
    await view.receive({action:'choose',key:'technicalLibraryPaths'});
    assert.deepEqual(h.mock.values.technicalLibraryPaths, [file]);
    assert.equal(view.messages.at(-1).target, 'technicalLibraryPathsNotice');
    assert.match(view.messages.at(-1).text, /已添加 1 个通用技术库.*17 条词条/);
    const {document,position} = documentFixture('parse_frame');
    const hover = await h.mock.hover.provideHover(document,position,{isCancellationRequested:false});
    assert.match(hover.contents.value, /解析帧/);
    h.panels.refresh();
    assert.match(view.messages.at(-1).html, /technicalLibraryPathsNotice[^>]*>已添加 1 个通用技术库/);
    await view.receive({action:'choose',key:'technicalLibraryPaths'});
    assert.deepEqual(h.mock.values.technicalLibraryPaths, [file]);
    assert.match(view.messages.at(-1).text, /已在列表中.*重新加载/);
    h.mock.dialog = undefined;
    await view.receive({action:'choose',key:'technicalLibraryPaths'});
    assert.match(view.messages.at(-1).text, /已取消/);
    const bad = path.join(__dirname, 'missing-<bad>.json');
    h.mock.dialog = [{fsPath:file},{fsPath:bad}];
    await view.receive({action:'choose',key:'technicalLibraryPaths'});
    assert.deepEqual(h.mock.values.technicalLibraryPaths, [file]);
    assert.equal(view.messages.at(-1).target, 'technicalLibraryPathsNotice');
    assert.ok(view.messages.at(-1).text.includes(bad));
    assert.match(view.messages.at(-1).text, /当前配置未修改/);
    h.panels.refresh();
    assert.match(view.messages.at(-1).html, /missing-&lt;bad&gt;\.json/);
    await view.receive({action:'remove',key:'technicalLibraryPaths',index:0});
    assert.deepEqual(h.mock.values.technicalLibraryPaths, []);
    assert.match(view.messages.at(-1).text, /已移除/);
  } finally { h.dispose(); }
});

test('settings copies the complete maintained AI handoff and reports clipboard errors beside the button', async () => {
  const h = await extensionHarness([]);
  try {
    await h.commands.get('daiguaTranslate.openSettings')();
    const view = h.mock.panels.at(-1);
    assert.match(view.webview.html, /复制完整提示词/);
    assert.match(view.webview.html, /查看完整提示词/);
    await view.receive({action:'copyAiHandoff', value:'untrusted replacement'});
    const template = fs.readFileSync(path.resolve(__dirname, '../../docs/external-ai-handoff.md'), 'utf8');
    assert.equal(h.mock.copied, template.replace('{{LIBRARY_DIRECTORY}}', '（未设置，请填写含 library.json 的词库目录）'));
    h.mock.values.libraryDirectory = 'M:\\测试 $& <词库>';
    h.panels.refresh();
    await view.receive({action:'copyAiHandoff'});
    assert.equal(h.mock.copied, template.replace('{{LIBRARY_DIRECTORY}}', () => h.mock.values.libraryDirectory));
    assert.ok(view.messages.some(m => m.html?.includes('M:\\测试 $&amp; &lt;词库&gt;')));
    delete h.mock.values.libraryDirectory;
    assert.match(view.messages.at(-1).text, /已复制完整提示词/);
    assert.equal(view.messages.at(-1).target, 'aiHandoffNotice');
    assert.equal(h.mock.updates.length, 0);
    h.mock.vscode.env.clipboard.writeText = async () => { throw Error('clipboard unavailable'); };
    await view.receive({action:'copyAiHandoff'});
    assert.match(view.messages.at(-1).text, /操作未完成.*clipboard unavailable/);
    assert.equal(view.messages.at(-1).target, 'aiHandoffNotice');
  } finally { h.dispose(); }
});

test('active lookups append only unresolved source identifiers to a shared handoff file', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daigua-missing-terms-'));
  const library = path.join(directory, 'library');
  const storage = path.join(directory, 'storage');
  const missingFile = path.join(storage, 'missing-terms.jsonl');
  const currentRoot = path.join(directory, 'current');
  const otherRoot = path.join(directory, 'other');
  const catalog = { format_version: 1, word_libraries: ['words.json'], naming_libraries: ['naming.json'], projects: [] };
  fs.mkdirSync(library);
  require('../../tests/fixtures/cross-project.cjs')(catalog, library, currentRoot);
  const manifest = path.join(library, 'library.json');
  fs.writeFileSync(manifest, JSON.stringify(catalog));
  const term = { reading: 'unknown', source: 'fixture', review_status: 'unreviewed' };
  fs.writeFileSync(path.join(library, 'words.json'), JSON.stringify({ format_version: 1, entries: [
    { ...term, token: 'EK', match: 'exact', translation: '测试组织' },
  ] }));
  fs.writeFileSync(path.join(library, 'naming.json'), JSON.stringify({ format_version: 1, entries: [
    { ...term, token: 'board_init', match: 'identifier', translation: '板级初始化', summary_zh: '准备硬件。' },
  ] }));
  const hosts = [];
  const start = async () => {
    const h = await extensionHarness([], false, storage);
    hosts.push(h);
    h.mock.values.libraryDirectory = library;
    h.mock.values.bingTimeoutMs = 100;
    await h.reload();
    return h;
  };
  const source = (h, text, root = currentRoot, line = 2) => {
    const fixture = documentFixture(text);
    const file = path.join(root, 'probe.c');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(file, '\n'.repeat(line) + text);
    const { document, range, position, editor } = fixture;
    position.line = line;
    range.start = { line, character: 0 };
    document.uri = require('node:url').pathToFileURL(file);
    document.uri.fsPath = file;
    document.uri.scheme = 'file';
    document.lineCount = line + 1;
    document.lineAt = () => ({ text });
    h.mock.vscode.workspace.textDocuments = [document];
    h.mock.vscode.window.activeTextEditor = editor;
    h.mock.changeEditor();
    return { ...fixture, file };
  };
  const entries = () => fs.readFileSync(missingFile, 'utf8').trim().split('\n').map(JSON.parse);
  const translate = h => h.commands.get('daiguaTranslate.translateSelection')();
  try {
    const h = await start();
    source(h, 'Missing_Disabled');
    await translate(h);
    assert.equal(fs.existsSync(missingFile), false);
    await h.commands.get('daiguaTranslate.openSettings')();
    const settings = h.mock.panels.at(-1);
    assert.match(settings.webview.html, /复制待补词条处理提示词/);
    await settings.receive({ action: 'set', key: 'recordMissingTerms', value: true });
    assert.equal(h.mock.updates.at(-1).target, h.mock.vscode.ConfigurationTarget.Global);

    const hoverSource = source(h, 'From_Hover');
    const hover = await h.mock.hover.provideHover(hoverSource.document, hoverSource.position, { isCancellationRequested: false });
    assert.equal(fs.existsSync(missingFile), false);
    const args = JSON.parse(decodeURIComponent(hover.contents.value.match(/command:daiguaTranslate\.openDetails\?([^)]*)\)/)[1]));
    source(h, 'Cursor_In_Another_File', otherRoot);
    h.mock.vscode.workspace.textDocuments.push(hoverSource.document);
    await h.commands.get('daiguaTranslate.openDetails')(...args);
    assert.deepEqual(entries(), [{ file: hoverSource.file, symbol: 'From_Hover', line: 3 }]);

    for (const covered of ['cross_function', 'shared_arg', 'EK', 'board_init']) {
      source(h, covered);
      h.mock.values.includeParameters = false;
      await translate(h);
    }
    assert.equal(entries().length, 1);
    h.mock.values.includeParameters = true;
    const reference = source(h, 'cross_function', otherRoot);
    await translate(h);
    source(h, 'app_board_init');
    await translate(h);
    source(h, 'Two words');
    await translate(h);
    h.mock.input = 'Input_Without_Source';
    await h.commands.get('daiguaTranslate.translateText')();
    assert.deepEqual(entries().map(({ symbol }) => symbol), ['From_Hover', 'cross_function', 'app_board_init']);
    assert.equal(entries()[1].file, reference.file);

    const second = await start();
    second.mock.values.recordMissingTerms = true;
    second.translator.bingTranslator = () => new Promise(() => {});
    const success = source(h, 'Bing_Success');
    const timeout = source(second, 'Bing_Timeout', otherRoot, 4);
    await Promise.all([translate(h), translate(second)]);
    assert.deepEqual(entries().slice(3).sort((a, b) => a.symbol.localeCompare(b.symbol)), [
      { file: success.file, symbol: 'Bing_Success', line: 3 },
      { file: timeout.file, symbol: 'Bing_Timeout', line: 5 },
    ]);
    assert.ok(second.messages.log.some(message => message.includes('等待超过 100 ms')));

    await settings.receive({ action: 'copyMissingTermsHandoff', value: 'untrusted replacement' });
    const template = fs.readFileSync(path.resolve(__dirname, '../../docs/missing-terms-handoff.md'), 'utf8');
    assert.equal(h.mock.copied, template.replace('{{MISSING_TERMS_FILE}}', () => missingFile).replace('{{LIBRARY_DIRECTORY}}', () => library));
    assert.equal(settings.messages.at(-1).target, 'missingTermsHandoffNotice');
    assert.doesNotMatch(h.mock.copied, /Bing_Timeout|From_Hover/);

    h.dispose();
    const restarted = await start();
    restarted.mock.values.recordMissingTerms = true;
    assert.equal(entries().length, 5);
    fs.writeFileSync(manifest, '{broken');
    await restarted.reload();
    source(restarted, 'Broken_Library');
    await translate(restarted);
    assert.equal(entries().length, 5);
  } finally {
    for (const h of hosts) h.dispose();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});


test('directory watchers reload enabled words and catalog, retain invalid data, and forget removed files', async () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'daigua-watch-directory-'));
  fs.cpSync(path.resolve(__dirname,'../../dictionaries'),directory,{recursive:true});
  const manifest=path.join(directory,'library.json');
  const catalog=JSON.parse(fs.readFileSync(manifest,'utf8')); delete catalog.dictionary_path;
  fs.writeFileSync(manifest,JSON.stringify(catalog));
  const h=await extensionHarness([],false);
  const {document,position}=documentFixture('EK');
  const hover=async()=> (await h.mock.hover.provideHover(document,position,{isCancellationRequested:false})).contents.value;
  const changed=file=>{for(const watcher of h.mock.watchers.filter(w=>!w.disposed)) watcher.callbacks.Change?.({fsPath:file});};
  try {
    h.mock.dialog=[{fsPath:directory}];await h.commands.get('daiguaTranslate.choosePacks')();
    h.mock.values.bingEnabled=false;h.mock.values.hoverFallback='ecdict';
    const words=path.join(directory,catalog.word_libraries[0]);
    const data=JSON.parse(fs.readFileSync(words,'utf8'));
    assert.match(await hover(),/熠日照明/);
    data.entries.find(t=>t.token==='EK').translation='组织修正';
    fs.writeFileSync(words,JSON.stringify(data));changed(words);
    await new Promise(r=>setTimeout(r,400));assert.match(await hover(),/组织修正/);
    fs.writeFileSync(words,'{broken');changed(words);
    await new Promise(r=>setTimeout(r,400));assert.match(await hover(),/组织修正/);
    assert.ok(h.messages.log.some(t=>t.includes('保留旧内容：true')));
    fs.writeFileSync(manifest,'{broken');changed(manifest);
    await new Promise(r=>setTimeout(r,400));assert.match(await hover(),/组织修正/);
    catalog.word_libraries=catalog.word_libraries.slice(1);
    fs.writeFileSync(manifest,JSON.stringify(catalog));changed(manifest);
    await new Promise(r=>setTimeout(r,400));assert.doesNotMatch(await hover(),/组织修正/);
    const count=h.messages.log.length;changed(words);changed(path.join(directory,'not-enabled.json'));
    await new Promise(r=>setTimeout(r,350));assert.equal(h.messages.log.length,count);
  } finally {h.dispose();fs.rmSync(directory,{recursive:true,force:true});}
});


test('stale registration still saves directory, queries it, shows it in settings and removes it', async()=>{
  const h=await extensionHarness([],false);
  const {document,position}=documentFixture('EK');
  try {
    h.mock.missingKeys.add('libraryDirectory');
    h.mock.dialog=[{fsPath:path.resolve(__dirname,'../../dictionaries')}];
    h.mock.values.bingEnabled=false;
    await h.commands.get('daiguaTranslate.choosePacks')();
    assert.equal(h.mock.values.libraryDirectory,undefined);
    assert.equal(h.messages.warning.length,0);
    assert.match((await h.mock.hover.provideHover(document,position,{isCancellationRequested:false})).contents.value,/熠日照明/);
    await h.commands.get('daiguaTranslate.openSettings')();
    const settings=h.mock.panels.at(-1);assert.ok(settings.webview.html.includes('dictionaries'));
    await settings.receive({action:'copyAiHandoff'});
    assert.ok(h.mock.copied.includes(path.resolve(__dirname,'../../dictionaries')));
    await settings.receive({action:'remove',key:'libraryDirectory'});
    assert.match(settings.messages.at(-1).text,/已移除/);
    assert.doesNotMatch((await h.mock.hover.provideHover(document,position,{isCancellationRequested:false})).contents.value,/熠日照明/);
  } finally {h.dispose();}
});

test('switching to an invalid directory clears a following panel instead of leaving old source results', async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'daigua-invalid-switch-'));
  const file=path.join(directory,'pack.json');fs.writeFileSync(file,JSON.stringify(pack('旧目录释义')));
  const h=await extensionHarness([file]);const {editor}=documentFixture('Motor_Start');
  try {
    h.mock.vscode.window.activeTextEditor=editor;
    await h.commands.get('daiguaTranslate.openDetails')('Motor_Start');
    assert.equal(h.panels.result.candidates[0].name,'旧目录释义');
    h.mock.values.libraryDirectory=path.join(directory,'missing');
    await h.mock.fireSettings('daiguaTranslate.libraryDirectory');
    assert.equal(h.panels.result,undefined);
    assert.ok(h.mock.watchers.filter(w=>!w.disposed).some(w=>w.pattern.pattern==='**/*'));
  } finally {h.dispose();fs.rmSync(directory,{recursive:true,force:true});}
});
