const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { OfflineDictionary, validateTerms } = require('../out/offline-dictionary');
const { DaiguaTranslate } = require('../out/daigua-translate');
const { hoverMarkdown, resultHtml } = require('../out/result-renderer');

test('reader details cover source, full-name and component results without changing hover', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daigua-name-details-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const term = (token, match, translation, extra = {}) => ({ token, match, translation, reading:'unknown', source:'fixture', review_status:'unreviewed', ...extra });
  const entries = [term('IRQ','exact','中断请求',{ expansion:'interrupt request' }),
    term('g','prefix','全局变量',{ panel_only:true, summary_zh:'标记全局变量。' }),
    term('gIRQ','identifier','完整约定',{ summary_zh:'完整名称。' })];
  const file = path.join(dir,'terms.json');
  fs.writeFileSync(file, JSON.stringify({format_version:1,entries}));
  fs.writeFileSync(path.join(dir,'manifest.json'), JSON.stringify({format_version:1,source_sha256:'a'.repeat(64),shards:{in:'in.json',re:'re.json'}}));
  fs.writeFileSync(path.join(dir,'in.json'), JSON.stringify({interrupt:[{word:'interrupt',translation:'中断',phonetic:'ɪntə'}]}));
  fs.writeFileSync(path.join(dir,'re.json'), JSON.stringify({request:[{word:'request',translation:'请求',phonetic:''}]}));
  const d = new OfflineDictionary(() => ({dictionaryPath:dir,technicalLibraryPaths:[file]}));
  const pack = {name:'fixture',version:'1',entries:[{symbol:'gIRQ',kind:'variable',name_zh:'源码中文',source:{file:'a.c'}}]};
  const source = await new DaiguaTranslate([pack]).queryResult('gIRQ','off',d);
  const full = await new DaiguaTranslate([]).queryResult('gIRQ','ecdict',d);
  const split = await new DaiguaTranslate([]).queryResult('IRQ','ecdict',d);
  for (const result of [source,full,split]) {
    const html = resultHtml(result);
    assert.match(html,/interrupt request/); assert.match(html,/interrupt \/ɪntə\//); assert.match(html,/部分音标暂缺/);
    assert.doesNotMatch(hoverMarkdown(result),/缩写原词|interrupt request|名称补充/);
  }
  assert.match(resultHtml(source),/源码中文/); assert.match(resultHtml(full),/完整约定/);
  assert.match(resultHtml(source),/常见命名约定/); assert.match(resultHtml(source),/标记全局变量/);
  assert.equal((await d.nameDetails('g')).length,0);
  assert.equal((await d.nameDetails('green')).length,0);
  assert.equal((await d.explainResult('gIRQExtra')).components[0].meanings[0], '全局变量');
  fs.writeFileSync(path.join(dir,'in.json'), JSON.stringify({interrupt:[{word:'interrupt',translation:'中断',phonetic:'one'}, {word:'interrupt',translation:'中断',phonetic:'two'}]}));
  d.reset();
  assert.match(resultHtml(await new DaiguaTranslate([]).queryResult('IRQ','ecdict',d)), /原词音标暂缺/);
  fs.writeFileSync(file, JSON.stringify({format_version:1,entries:[term('IRQ','exact','中断请求',{expansion:'<unsafe> request'})]}));
  d.reset();
  const safe = resultHtml(await new DaiguaTranslate([]).queryResult('IRQ','ecdict',d));
  assert.match(safe,/&lt;unsafe&gt; request/); assert.doesNotMatch(safe,/<unsafe>/);
});

test('old terms remain valid and panel-only rules require a boolean prefix', () => {
  const old = {token:'old',match:'exact',translation:'旧词条',reading:'unknown',source:'fixture',review_status:'unreviewed'};
  assert.equal(validateTerms({format_version:1,entries:[old]}).length,1);
  assert.throws(() => validateTerms({format_version:1,entries:[{...old,panel_only:true}]}));
  assert.throws(() => validateTerms({format_version:1,entries:[{...old,match:'prefix',panel_only:'yes'}]}));
});

test('reader explains underscore and camel prefixes without changing online translation or hover', async () => {
  const paths = require('../../tests/fixtures/library-paths.cjs');
  const d = new OfflineDictionary(() => ({dictionaryPath:'', technicalLibraryPaths:paths}));
  const translator = new DaiguaTranslate([], async () => ({translation:'p Mac'}));
  for (const [name, meaning] of [['p_mac','指针变量'],['pMac','指针变量'],['s_count','静态变量'],['sCount','静态变量']]) {
    const result = await translator.queryResult(name, 'online', d);
    assert.equal(result.kind, 'online');
    assert.match(resultHtml(result), new RegExp(meaning), name);
    assert.doesNotMatch(hoverMarkdown(result), /指针变量|静态变量|名称补充/, name);
  }
  for (const name of ['p','p_','p_1','_p_mac','apple','sp_count']) {
    assert.deepEqual(await d.nameDetails(name), [], name);
  }
  assert.equal((await translator.queryResult('p_mac', 'online', d)).candidates[0].name, 'p Mac');
});

test('offline prefixes use enabled conventions and recognize only supported combinations', async () => {
  const paths = require('../../tests/fixtures/library-paths.cjs');
  const d = new OfflineDictionary(() => ({ dictionaryPath:'', technicalLibraryPaths:paths }));
  for (const name of ['p_mac', 'pMac']) {
    const result = await d.explainResult(name);
    assert.equal(result.components[0].meanings[0], '指针前缀');
    assert.match(hoverMarkdown(result), /指针前缀/);
    assert.doesNotMatch(hoverMarkdown(result), /便士|名称补充/);
  }
  const combined = await d.explainResult('g_pBuffer');
  assert.match(combined.components[0].meanings[0], /全局变量/);
  assert.equal(combined.components[1].meanings[0], '指针前缀');
  assert.deepEqual((await d.nameDetails('g_pBuffer')).filter(d => d.kind === 'prefix').map(d => d.text), ['g','p']);
  const puc = await d.explainResult('pucBuffer');
  assert.match(puc.components[0].meanings[0], /无符号字符指针/);
  assert.match(resultHtml({ ...puc, nameDetails: await d.nameDetails('pucBuffer') }), /指向无符号字符/);
  for (const name of ['p','p_','p_1','_p_mac','apple','sp_count','pucbuffer']) {
    assert.equal((await d.nameDetails(name)).filter(d => d.kind === 'prefix').length, 0, name);
  }
  assert.deepEqual((await d.nameDetails('g_project_buffer')).map(d => d.text), ['g']);
  assert.deepEqual((await d.nameDetails('g_p_1')).map(d => d.text), ['g']);
  const disabled = new OfflineDictionary(() => ({ dictionaryPath:'', technicalLibraryPaths:[] }));
  assert.deepEqual(await disabled.nameDetails('g_pBuffer'), []);
  assert.deepEqual(await disabled.nameDetails('pucBuffer'), []);
  const translator = new DaiguaTranslate([], async () => ({translation:'联网结果'}));
  for (const name of ['p_mac','pMac','g_pBuffer','pucBuffer']) {
    assert.equal((await translator.queryResult(name, 'online', d)).kind, 'online', name);
  }
});

test('combined prefix display honors enabled library order and symbol scope', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daigua-prefix-priority-'));
  t.after(() => fs.rmSync(dir, {recursive:true,force:true}));
  const term = (token, translation, extra = {}) => ({token,match:'prefix',translation,
    reading:'unknown',source:'fixture',review_status:'unreviewed',panel_only:true,...extra});
  const base = path.join(dir, 'base.json'), override = path.join(dir, 'override.json');
  fs.writeFileSync(base, JSON.stringify({format_version:1,entries:[term('g','全局'),term('p','基础指针')]}));
  fs.writeFileSync(override, JSON.stringify({format_version:1,entries:[term('p','限定指针',{symbol:'g_pBuffer'})]}));
  const d = new OfflineDictionary(() => ({dictionaryPath:'',technicalLibraryPaths:[base,override]}));
  assert.equal((await d.nameDetails('g_pBuffer')).find(x => x.text === 'p').description, '限定指针');
  assert.equal((await d.explainResult('g_pBuffer')).components[1].meanings[0], '限定指针');
  assert.equal((await d.nameDetails('g_pOther')).find(x => x.text === 'p').description, '基础指针');
  assert.equal((await d.explainResult('g_pOther')).components[1].meanings[0], '基础指针');
});
