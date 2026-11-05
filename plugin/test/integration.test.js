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
  const state = {
    values: { packPaths: paths }, source: 'elio-zwd.daigua-translator-daigua',
    messages: { info: [], warning: [], log: [] }, commands: new Map(), watchers: [],
    hover: undefined, dialog: undefined, input: undefined, status: {}, updates: [],
  };
  let change;
  const disposable = () => ({ dispose() {} });
  state.fireSettings = name => change({ affectsConfiguration: section => section === name });
  state.vscode = {
    ConfigurationTarget: { Global: 1, Workspace: 2 }, StatusBarAlignment: { Right: 2 },
    RelativePattern: class { constructor(base, pattern) { this.base = base; this.pattern = pattern; } },
    MarkdownString: class {
      value = ''; appendMarkdown(text) { this.value += text; return this; }
      appendText(text) { this.value += text; return this; }
    },
    Hover: class { constructor(contents, range) { this.contents = contents; this.range = range; } },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
      getConfiguration: section => ({
        get: (key, fallback) => section === 'mtrancode' ? state.source : (state.values[key] ?? fallback),
        inspect: key => ({ workspaceValue: state.values[key] }),
        update: async (key, value, target) => {
          state.updates.push({ section, key, value, target });
          if (section === 'mtrancode') state.source = value; else state.values[key] = value;
          await state.fireSettings(`${section}.${key}`);
        },
      }),
      onDidChangeConfiguration: cb => { change = cb; return disposable(); },
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
      executeCommand: async () => {},
    },
    window: {
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

test('MTranCode extension registration keeps the same translator alive across reload', async () => {
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
    extension = require('../out/extension');
  } finally {
    Module._load = originalLoad;
  }
  try {
    const exports = await extension.activate({ subscriptions: [], extension: { packageJSON: { version: '0.3.0' } } });
    let translator;
    exports.extendTranslate((id, Constructor) => {
      assert.equal(id, 'daigua');
      translator = new Constructor();
    });
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


async function extensionHarness(paths) {
  const mock = vscodeMock(paths);
  const { vscode, messages, commands } = mock;
  const originalLoad = Module._load;
  let extension;
  try {
    Module._load = function(request) {
      if (request === 'vscode') return vscode;
      return originalLoad.apply(this, arguments);
    };
    delete require.cache[require.resolve('../out/extension')];
    extension = require('../out/extension');
  } finally { Module._load = originalLoad; }
  const api = await extension.activate({ subscriptions: [], extension: { packageJSON: { version: '0.3.0' } } });
  let translator;
  api.extendTranslate((id, Constructor) => { assert.equal(id, 'daigua'); translator = new Constructor(); });
  translator.bingTranslator = async () => ({ translation: 'fallback' });
  return { translator, messages, mock, commands, dispose: () => extension.deactivate(),
    reload: () => commands.get('daiguaTranslate.reloadPacks')(),
    paths: next => { mock.values.packPaths = next; return mock.fireSettings('daiguaTranslate.packPaths'); } };
}

test('bad reload warns with path, retains last valid pack, and forgets removed paths', async () => {
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
    assert.ok(harness.messages.warning[0].includes(file));
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

test('Bing has a bounded wait and coalesces identical requests until transport settles', async () => {
  let calls = 0, finish;
  const translator = new DaiguaTranslate([], async () => {
    calls++;
    return new Promise(resolve => { finish = resolve; });
  }, () => ({ bingEnabled: true, bingTimeoutMs: 100, includeParameters: true }));
  const a = assert.rejects(translator.translate('hello', {}), /等待超过 100 ms/);
  const b = assert.rejects(translator.translate('hello', {}), /等待超过 100 ms/);
  await Promise.all([a, b]);
  assert.equal(calls, 1);
  const later = translator.translate('hello', {});
  finish({ translation: '你好' });
  assert.equal(await later, '你好');
  assert.equal(calls, 1);
  const after = translator.translate('hello', {});
  finish({ translation: '新请求' });
  assert.equal(await after, '新请求');
  assert.equal(calls, 2, 'completed results are not cached by this extension');
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
    assert.match(harness.messages.log.at(-1), /本地未命中/);
    const document = { getWordRangeAtPosition: () => ({}), getText: () => 'Motor_Start' };
    const hover = harness.mock.hover.provideHover(document, {});
    assert.match(hover.contents.value, /呆瓜 · 本地知识包/);
    assert.match(hover.contents.value, /诊断探针/);
    harness.mock.values.localHover = false;
    assert.equal(harness.mock.hover.provideHover(document, {}), undefined);
    harness.mock.pick = 'Bing 回退';
    await harness.commands.get('daiguaTranslate.quickSettings')();
    assert.match(harness.mock.status.text, /仅本地/);
    await assert.rejects(harness.translator.translate('new_unknown', {}), /回退已关闭/);
  } finally { harness.dispose(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('file picker rejects invalid files before updating settings, switches packs and respects no-workspace scope', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daigua-picker-'));
  const file = path.join(dir, 'old.json'), other = path.join(dir, 'new.json'), invalid = path.join(dir, 'manifest.json');
  fs.writeFileSync(file, JSON.stringify(pack('原始')));
  fs.writeFileSync(other, JSON.stringify(pack('切换成功')));
  fs.writeFileSync(invalid, '{}');
  const harness = await extensionHarness([file]);
  try {
    harness.mock.dialog = [{ fsPath: invalid }];
    await harness.commands.get('daiguaTranslate.choosePacks')();
    assert.deepEqual(harness.mock.values.packPaths, [file]);
    assert.equal(harness.mock.updates.length, 0);
    assert.match(harness.messages.warning.at(-1), /未修改当前路径/);
    harness.mock.dialog = [{ fsPath: other }];
    await harness.commands.get('daiguaTranslate.choosePacks')();
    assert.equal(harness.mock.updates.at(-1).target, 2);
    assert.match(await harness.translator.translate('Motor_Start', {}), /切换成功/);
    harness.mock.vscode.workspace.workspaceFolders = [];
    harness.mock.dialog = [{ fsPath: file }];
    await harness.commands.get('daiguaTranslate.choosePacks')();
    assert.equal(harness.mock.updates.at(-1).target, 1);
  } finally { harness.dispose(); fs.rmSync(dir, { recursive: true, force: true }); }
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
