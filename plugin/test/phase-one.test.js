const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { splitIdentifier } = require('../out/identifier-words');
const { OfflineDictionary } = require('../out/offline-dictionary');
const { DaiguaTranslate } = require('../out/daigua-translate');
const { KnowledgeLoader } = require('../out/knowledge-loader');
const { formatEntries } = require('../out/symbol-matcher');
const { sanitizePronunciation } = require('../out/pronunciation');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), '呆瓜 词典-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const write = (file, data) => fs.writeFileSync(path.join(directory, file), JSON.stringify(data));
  write('manifest.json', { format_version: 1, source_sha256: 'a'.repeat(64), shards: { mo: 'mo.json', st: 'st.json' } });
  write('mo.json', { motor: [{ word: 'motor', translation: '马达\\n发动机', phonetic: "'mәutә" }] });
  write('st.json', { start: [{ word: 'start', translation: '启动', phonetic: 'stɑ:t' }] });
  const warnings = [];
  let paths = [];
  const offline = new OfflineDictionary(() => ({ dictionaryPath: directory, technicalLibraryPaths: paths }), m => warnings.push(m));
  return { directory, write, warnings, offline, setPaths: p => { paths = p; } };
}

test('Python/TypeScript shared identifier boundaries', () => {
  for (const [symbol, expected] of require('../../tests/fixtures/identifier-words.json')) {
    assert.deepEqual(splitIdentifier(symbol), expected, symbol);
  }
});

for (const item of require('../../tests/fixtures/pronunciation.json')) {
  test(`Python/TypeScript optional pronunciation: ${item.name}`, () => {
    const warnings = [];
    const result = sanitizePronunciation(item.value, m => warnings.push(m));
    assert.equal(result?.segments.length || 0, item.segments);
    assert.equal(warnings.length, item.warnings);
  });
}

test('offline dictionary shows component meanings, preserved IPA and source, not project purpose', async t => {
  const { offline } = fixture(t);
  const text = await offline.explain('Motor_Start');
  assert.match(text, /用途未核对/);
  assert.match(text, /Motor：马达\n发动机/);
  assert.match(text, /Start：启动/);
  assert.ok(text.includes("'mәutә"));
  assert.match(text, /ECDICT:aaaaaaaaaaaa/);
});

test('model-like fragments touching digits do not inherit ordinary-word IPA', async t => {
  const { offline } = fixture(t);
  const result = await offline.explain('Motor32');
  assert.match(result, /读法待确认/);
  assert.ok(!result.includes("'mәutә"));
});

test('technical terms override false dictionary meanings and prefixes are position-specific', async t => {
  const { offline } = fixture(t);
  const text = await offline.explain('xLED_ms');
  assert.match(text, /x：FreeRTOS/);
  assert.match(text, /不发音/);
  assert.match(text, /拼字母/);
  assert.match(text, /毫秒/);
  assert.match(text, /待人工复核/);
  const lone = await offline.explain('x');
  assert.doesNotMatch(lone, /不发音/);
});

test('project supplementary terms take precedence and remain limited to the specified symbol', async t => {
  const { offline, directory, write, setPaths } = fixture(t);
  const term = { token: 'Motor', match: 'exact', symbol: 'Motor_Start', translation: '项目普通释义', reading: 'letters',
    phonetic: 'test', source: 'external-ai:fixture', review_status: 'unreviewed' };
  write('terms.json', { format_version: 1, entries: [term] });
  setPaths([path.join(directory, 'terms.json')]);
  assert.match(await offline.explain('Motor_Start'), /项目普通释义/);
  assert.doesNotMatch(await offline.explain('Motor_Stop'), /项目普通释义/);
});

test('missing/corrupt index and unsafe shard path produce diagnostics without breaking library lookup', async t => {
  const { offline, write, warnings } = fixture(t);
  write('manifest.json', { format_version: 1, source_sha256: 'a'.repeat(64), shards: { mo: '../outside.json' } });
  assert.match(await offline.explain('Motor_LED'), /分片路径无效/);
  assert.match(await offline.explain('LED'), /发光二极管/);
  assert.ok(warnings.length);
  offline.reset();
  write('manifest.json', { format_version: 2 });
  assert.match(await offline.explain('Motor'), /格式不兼容/);
  const absent = new OfflineDictionary(() => ({ dictionaryPath: '', technicalLibraryPaths: [] }));
  assert.match(await absent.explain('Motor'), /尚未配置/);
});

test('dictionary shard cache remains bounded', async t => {
  const { offline, write } = fixture(t);
  const shards = {};
  for (const token of ['aa', 'ab', 'ac', 'ad', 'ae', 'af', 'ag', 'ah', 'ai', 'aj']) {
    shards[token] = token + '.json'; write(token + '.json', {});
  }
  write('manifest.json', { format_version: 1, source_sha256: 'a'.repeat(64), shards });
  await offline.explain(Object.keys(shards).join('_'));
  assert.equal(offline.shards.size, 8);
});

test('hover modes/global network switch, explicit query and failed online fallback share one service', async t => {
  const { offline } = fixture(t);
  let enabled = true, calls = 0, fail = false;
  const translator = new DaiguaTranslate([], async input => {
    calls++;
    if (fail) throw Error('offline-test');
    assert.equal(input, 'Motor Start');
    return { translation: '启动马达' };
  }, () => ({ bingEnabled: enabled, bingTimeoutMs: 100, includeParameters: true }));
  assert.match(await translator.query('Motor_Start', 'online', offline), /Bing.*用途未核对/);
  assert.equal(calls, 1);
  assert.match(await translator.query('Motor_Start', 'ecdict', offline), /ECDICT/);
  assert.equal(await translator.query('Motor_Start', 'off', offline), '');
  assert.equal(calls, 1);
  enabled = false;
  assert.match(await translator.query('Motor_Start', 'online', offline), /ECDICT/);
  assert.equal(calls, 1);
  await assert.rejects(translator.query('an ordinary sentence', 'online', offline), /联网翻译已关闭/);
  enabled = true; fail = true;
  assert.match(await translator.query('Motor_Start', 'online', offline), /联网失败：offline-test[\s\S]*ECDICT/);
});

test('online timeout falls back offline while the transport remains deduplicated', async t => {
  const { offline } = fixture(t);
  let calls = 0, resolve;
  const translator = new DaiguaTranslate([], () => { calls++; return new Promise(r => { resolve = r; }); },
    () => ({ bingEnabled: true, bingTimeoutMs: 100, includeParameters: true }));
  const results = await Promise.all([translator.query('Motor_Start', 'online', offline), translator.query('Motor_Start', 'online', offline)]);
  assert.equal(calls, 1);
  assert.ok(results.every(r => r.includes('等待超过 100 ms') && r.includes('ECDICT')));
  resolve({ translation: 'late' });
});

test('sentence input is unmodified; long input is rejected before any network call', async t => {
  const { offline } = fixture(t);
  const sentence = '// read Motor_Start()\n/* keep_this_sentence */';
  let received, calls = 0;
  const translator = new DaiguaTranslate([], async input => { calls++; received = input; return { translation: '译文' }; });
  assert.match(await translator.query(sentence, 'online', offline), /Bing 联网翻译/);
  assert.equal(received, sentence);
  await assert.rejects(translator.query('a'.repeat(1001), 'online', offline), /最多 1000/);
  assert.equal(calls, 1);
});

test('partially corrupt optional pronunciation warns, preserves Chinese, and indexes parameter IPA', async t => {
  const { directory, write } = fixture(t);
  const valid = { text: 'Motor', reading: 'word', phonetic: 'test', source: 'ECDICT', status: 'resolved' };
  write('pack.json', { name: 'test', version: '1', entries: [{ symbol: 'Motor_Start', kind: 'function', name_zh: '原有中文',
    source: { file: 'test.c' }, pronunciation: { segments: [valid, null, { ...valid, phonetic: undefined }] },
    parameters: [{ name: 'arg', description_zh: '原有参数', pronunciation: { segments: [{ ...valid, text: 'arg' }] } }] }] });
  const report = await new KnowledgeLoader().loadWithReport([path.join(directory, 'pack.json')]);
  assert.equal(report.failures.length, 0);
  assert.equal(report.warnings.length, 2);
  const translator = new DaiguaTranslate(report.packs);
  assert.match(formatEntries(translator.findLocalEntries('arg')), /arg \/test\//);
  assert.match(await translator.query('Motor_Start', 'off', {}), /原有中文[\s\S]*音标/);
});

test('delivered 75-entry enhanced sample preserves all original knowledge and unresolved review states', async () => {
  const root = path.resolve(__dirname, '../..');
  const original = JSON.parse(fs.readFileSync(path.join(root, 'knowledge-packs/05_createtask-pack.json'), 'utf8'));
  const file = path.join(root, 'knowledge-packs/enhanced/05_createtask-pack.phonetic.json');
  const report = await new KnowledgeLoader().loadWithReport([file]);
  assert.deepEqual(report.failures, []);
  assert.deepEqual(report.warnings, []);
  const enhanced = JSON.parse(JSON.stringify(report.packs[0]));
  const segments = enhanced.entries.flatMap(e => [e, ...(e.parameters || [])].flatMap(p => p.pronunciation?.segments || []));
  assert.ok(segments.some(s => s.status === 'pending'));
  assert.ok(segments.some(s => s.source.startsWith('external-ai:') && s.review_status === 'unreviewed'));
  delete enhanced.pronunciation_metadata;
  for (const entry of enhanced.entries) {
    delete entry.pronunciation;
    for (const parameter of entry.parameters || []) delete parameter.pronunciation;
  }
  assert.deepEqual(enhanced, original);
});
