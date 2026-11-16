const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { OfflineDictionary } = require('../out/offline-dictionary');
const { DaiguaTranslate } = require('../out/daigua-translate');
const { hoverMarkdown, resultHtml } = require('../out/result-renderer');

function fixture(t, entries, dictionary = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daigua-source-pronunciation-'));
  t.after(() => fs.rmSync(dir, { recursive:true, force:true }));
  fs.writeFileSync(path.join(dir,'manifest.json'), JSON.stringify({format_version:1,source_sha256:'a'.repeat(64),shards:{pa:'pa.json',fr:'fr.json'}}));
  fs.writeFileSync(path.join(dir,'pa.json'), JSON.stringify({parse:[{word:'parse',translation:'解析',phonetic:'pɑ:s'}]}));
  fs.writeFileSync(path.join(dir,'fr.json'), JSON.stringify({frame:[{word:'frame',translation:'帧',phonetic:'freim'}]}));
  const pack = {name:'fixture',version:'1',entries};
  const d = new OfflineDictionary(() => ({dictionaryPath:dictionary ? dir : '',technicalLibraryPaths:require('../../tests/fixtures/library-paths.cjs')}));
  return { pack, d, translator:new DaiguaTranslate([pack]) };
}
const entry = (name, pronunciation) => ({symbol:'parse_frame',kind:'function',name_zh:name,
  summary_zh:'解析协议帧。',source:{file:'frame.c'},...(pronunciation ? {pronunciation} : {})});
const pending = text => ({text,reading:'unknown',status:'pending',source:'authored'});
const resolved = (text, phonetic) => ({text,reading:'word',status:'resolved',phonetic,source:'authored',review_status:'confirmed'});

test('source candidates reuse local phonetics while retaining authored source and review data', async t => {
  const original = {segments:[pending('parse_frame')]};
  const { pack, d, translator } = fixture(t, [entry('源码释义', original)]);
  const before = JSON.stringify(pack);
  for (const mode of ['off','ecdict','online']) {
    const result = await translator.queryResult('parse_frame', mode, d);
    assert.equal(result.kind, 'project'); assert.equal(result.candidates[0].name, '源码释义');
    assert.deepEqual(result.candidates[0].pronunciation.segments.map(s => s.phonetic), ['pɑ:s','freim']);
    for (const rendered of [hoverMarkdown(result), resultHtml(result)]) {
      assert.ok(rendered.includes('parse /pɑ:s/')); assert.ok(rendered.includes('frame /freim/'));
    }
    const debug = resultHtml(result, true);
    assert.match(debug, /authored/); assert.match(debug, /ECDICT:aaaaaaaaaaaa/);
    assert.equal(result.candidates[0].entry.pronunciation, original);
  }
  assert.equal(JSON.stringify(pack), before);
});

test('source fallback fills only aligned pending segments across independent candidates', async t => {
  const kept = resolved('parse','original');
  const partial = {segments:[kept,pending('frame')]};
  const skipped = {segments:[pending('parse'),{...pending('frame'),status:'skipped'}]};
  const mismatched = {segments:[pending('parse'),pending('mismatch')]};
  const { d, translator } = fixture(t, [entry('部分',partial),entry('缺失'),entry('跳过',skipped)]);
  const result = await translator.queryResult('parse_frame','ecdict',d);
  const byName = Object.fromEntries(result.candidates.map(c => [c.name,c.pronunciation]));
  assert.equal(byName['部分'].segments[0], kept);
  assert.equal(byName['部分'].segments[0].review_status, 'confirmed');
  assert.equal(byName['部分'].segments[1].phonetic, 'freim');
  assert.deepEqual(byName['缺失'].segments.map(s => s.phonetic), ['pɑ:s','freim']);
  assert.equal(byName['跳过'].segments[0].phonetic, 'pɑ:s');
  assert.equal(byName['跳过'].segments[1].status, 'skipped');
  const other = fixture(t, [entry('不对应',mismatched)]);
  assert.equal((await other.translator.queryResult('parse_frame','ecdict',other.d)).candidates[0].pronunciation, mismatched);
});

test('missing local evidence and general silent prefixes never overwrite source data', async t => {
  const original = {segments:[pending('parse_frame')]};
  const {d, translator} = fixture(t, [entry('原始待补',original)], false);
  assert.equal((await translator.queryResult('parse_frame','off',d)).candidates[0].pronunciation, original);
  const source = {symbol:'xParse',kind:'variable',name_zh:'示例',source:{file:'a.c'}};
  const other = fixture(t, [source]);
  const result = await other.translator.queryResult('xParse','off',other.d);
  assert.equal(result.candidates[0].pronunciation.segments[0].status,'pending');
  assert.equal(result.candidates[0].pronunciation.segments[0].reading,'unknown');
  assert.equal(result.candidates[0].pronunciation.segments[1].phonetic,'pɑ:s');
});
