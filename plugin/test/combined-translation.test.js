const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { OfflineDictionary } = require('../out/offline-dictionary');
const { DaiguaTranslate } = require('../out/daigua-translate');
const { hoverMarkdown, resultHtml } = require('../out/result-renderer');
const { legacyResult } = require('../out/query-result');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'daigua-combined-'));
  t.after(() => fs.rmSync(dir,{recursive:true,force:true}));
  const write = (name,value) => fs.writeFileSync(path.join(dir,name),JSON.stringify(value));
  write('terms.json',{format_version:1,entries:[
    {token:'init',match:'insensitive',translation:'初始化',expansion:'initialization',reading:'word',phonetic:'ɪnɪt',source:'fixture',review_status:'unreviewed'},
    {token:'board_init',match:'identifier',translation:'板级初始化',summary_zh:'准备硬件。',reading:'unknown',source:'fixture',review_status:'unreviewed'},
    {token:'s',match:'prefix',translation:'静态前缀',summary_zh:'静态变量前缀。',reading:'unknown',source:'fixture',review_status:'unreviewed',panel_only:true}
  ]});
  write('manifest.json',{format_version:1,source_sha256:'a'.repeat(64),shards:{fl:'fl.json',lo:'lo.json',le:'le.json',in:'in.json'}});
  write('fl.json',{flash:[{word:'flash',translation:'闪光',phonetic:'flæʃ'}]});
  write('lo.json',{low:[{word:'low',translation:'低',phonetic:'ləʊ'}]});
  write('le.json',{level:[{word:'level',translation:'水平',phonetic:'levəl'}]});
  write('in.json',{initialization:[{word:'initialization',translation:'初始化',phonetic:'init-ipa'}]});
  return new OfflineDictionary(() => ({dictionaryPath:dir,technicalLibraryPaths:[path.join(dir,'terms.json')]}));
}

test('partial local hits retain each component and add a Bing translation of the whole identifier', async t => {
  const offline = fixture(t), symbol = 'sFLASH_LowLevel_Init';
  let release, input, partial;
  const translator = new DaiguaTranslate([], async (text,from,to) => {
    input = {text,from,to}; return new Promise(resolve => { release = resolve; });
  });
  const request = translator.queryResult(symbol,'online',offline,undefined,r => { partial = r; });
  for (let n=0; n<100 && !release; n++) await new Promise(resolve => setTimeout(resolve,10));
  assert.ok(release, 'Bing request should start');
  assert.ok(partial, 'local content should be available before Bing returns');
  assert.equal(partial.kind,'dictionary'); assert.equal(partial.onlineTranslation,undefined);
  assert.deepEqual(partial.components.map(c => c.text),['s','FLASH','Low','Level','Init']);
  assert.equal(partial.components[1].pronunciation.segments[0].phonetic,'flæʃ');
  assert.ok(partial.nameDetails.some(item => item.text==='Init' && item.description==='initialization'));
  assert.equal(input.text,'s FLASH Low Level Init');
  assert.equal(input.from,'auto-detect'); assert.equal(input.to,'zh-Hans');
  release({translation:'闪存底层初始化'});
  const result = await request;
  assert.equal(result.onlineTranslation,'闪存底层初始化');
  assert.deepEqual(result.components,partial.components); assert.deepEqual(result.nameDetails,partial.nameDetails);
  for (const rendered of [hoverMarkdown(result),resultHtml(result)]) {
    assert.match(rendered,/联网翻译/); assert.match(rendered,/闪存底层初始化/);
    assert.match(rendered,/FLASH/); assert.match(rendered,/flæʃ/); assert.match(rendered,/初始化/);
  }
  assert.match(legacyResult(result),/联网翻译：闪存底层初始化/);
});

test('simultaneous reader and hover requests share a single whole-name Bing request', async t => {
  const offline=fixture(t), name='sFLASH_LowLevel_Init'; let calls=0, release, previews=0;
  const translator=new DaiguaTranslate([],()=>{calls++;return new Promise(resolve=>{release=resolve;});});
  const requests=[translator.queryResult(name,'online',offline,undefined,()=>previews++),
    translator.queryResult(name,'online',offline,undefined,()=>previews++)];
  for(let n=0;n<100 && (previews<2 || !release);n++) await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(previews,2); assert.equal(calls,1);
  release({translation:'闪存底层初始化'});
  for(const result of await Promise.all(requests)) assert.equal(result.onlineTranslation,'闪存底层初始化');
});

test('offline settings, full hits and single terms do not trigger supplemental Bing requests', async t => {
  const offline = fixture(t); let calls = 0;
  const translator = new DaiguaTranslate([],async () => { calls++; return {translation:'不应请求'}; });
  const name='sFLASH_LowLevel_Init';
  assert.equal((await translator.queryResult(name,'ecdict',offline)).onlineTranslation,undefined);
  assert.equal(await translator.queryResult(name,'off',offline),undefined);
  assert.equal((await translator.queryResult('Init','online',offline)).onlineTranslation,undefined);
  assert.equal((await translator.queryResult('board_init','online',offline)).kind,'general');
  const pack={name:'fixture',version:'1',entries:[{symbol:name,kind:'function',name_zh:'源码说明',source:{file:'test.c'}}]};
  assert.equal((await new DaiguaTranslate([pack],async()=>{calls++;return {translation:'unexpected'};}).queryResult(name,'online',offline)).kind,'project');
  const disabled = new DaiguaTranslate([],async()=>{calls++;return {translation:'unexpected'};},
    () => ({bingEnabled:false,bingTimeoutMs:100,includeParameters:true}));
  assert.equal((await disabled.queryResult(name,'online',offline)).onlineTranslation,undefined);
  assert.equal(calls,0);
});

test('Bing error, invalid result or timeout preserves local components and only records diagnostics', async t => {
  const offline=fixture(t), name='sFLASH_LowLevel_Init';
  for (const implementation of [async()=>{throw Error('offline');},async()=>({translation:''}),()=>new Promise(()=>{})]) {
    const translator=new DaiguaTranslate([],implementation,() => ({bingEnabled:true,bingTimeoutMs:100,includeParameters:true}));
    let partial;
    const result=await translator.queryResult(name,'online',offline,undefined,r=>{partial=r;});
    assert.ok(partial); assert.equal(result.kind,'dictionary'); assert.equal(result.onlineTranslation,undefined);
    assert.deepEqual(result.components,partial.components);
    assert.match(result.diagnostics.join('\n'),/联网补充失败/);
    assert.doesNotMatch(resultHtml(result),/offline|联网补充失败/);
  }
  let calls=0;
  const fallback=new DaiguaTranslate([],async()=>{calls++;throw Error('offline');});
  const plain=await fallback.queryResult('unknown_value','online',offline);
  assert.equal(plain.kind,'dictionary'); assert.equal(calls,1, 'failed normal fallback must not retry as a supplement');
});

test('supplemental Bing text is escaped in hover and reader', async t => {
  const offline=fixture(t), evil='<img src=x> [click](command:evil) **bold**';
  const translator=new DaiguaTranslate([],async()=>({translation:evil}));
  const result=await translator.queryResult('sFLASH_LowLevel_Init','online',offline);
  assert.doesNotMatch(resultHtml(result),/<img/); assert.match(resultHtml(result),/&lt;img/);
  assert.doesNotMatch(hoverMarkdown(result),/\[click\]\(command:evil\)/);
});
