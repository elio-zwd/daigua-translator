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
  let paths = [file];
  const commands = new Map();
  let configCallback;
  const vscode = {
    workspace: {
      getConfiguration: () => ({ get: () => paths }),
      onDidChangeConfiguration: callback => {
        configCallback = callback;
        return { dispose() {} };
      }
    },
    commands: {
      registerCommand: (name, callback) => {
        commands.set(name, callback);
        return { dispose() {} };
      }
    },
    window: { showInformationMessage: () => {}, showWarningMessage: () => {},
      createOutputChannel: () => ({ appendLine() {}, dispose() {} }) }
  };
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
    const exports = await extension.activate({ subscriptions: [] });
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
    paths = [file2];
    await configCallback({ affectsConfiguration: name => name === 'daiguaTranslate.packPaths' });
    assert.match(await translator.translate('Motor_Start', {}), /配置更改后的释义/);
  } finally {
    extension.deactivate();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


async function extensionHarness(paths) {
  const messages = { info: [], warning: [], log: [] };
  const commands = new Map();
  let change;
  const vscode = {
    workspace: {
      getConfiguration: () => ({ get: () => paths }),
      onDidChangeConfiguration: cb => { change = cb; return { dispose() {} }; }
    },
    commands: { registerCommand: (name, cb) => { commands.set(name, cb); return { dispose() {} }; } },
    window: {
      showInformationMessage: msg => messages.info.push(msg),
      showWarningMessage: msg => messages.warning.push(msg),
      createOutputChannel: () => ({ appendLine: msg => messages.log.push(msg), dispose() {} })
    }
  };
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
  const api = await extension.activate({ subscriptions: [] });
  let translator;
  api.extendTranslate((id, Constructor) => { assert.equal(id, 'daigua'); translator = new Constructor(); });
  translator.bingTranslator = async () => ({ translation: 'fallback' });
  return { translator, messages, dispose: () => extension.deactivate(),
    reload: () => commands.get('daiguaTranslate.reloadPacks')(),
    paths: next => { paths = next; return change({ affectsConfiguration: () => true }); } };
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
