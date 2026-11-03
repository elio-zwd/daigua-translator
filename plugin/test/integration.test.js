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
    window: { showInformationMessage: () => {} }
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
