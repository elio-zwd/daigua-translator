const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { OfflineDictionary } = require('../out/offline-dictionary');
const { DaiguaTranslate } = require('../out/daigua-translate');
const { projectResult } = require('../out/query-result');
const { escapeMarkdown, hoverMarkdown, resultHtml } = require('../out/result-renderer');
const { KnowledgeLoader } = require('../out/knowledge-loader');

function offline(paths = []) { return new OfflineDictionary(() => ({ dictionaryPath: '', technicalLibraryPaths: [...require('../../tests/fixtures/library-paths.cjs'), ...paths] })); }
test('general names normalize tokens, infer longest complete suffix, and never infer integer types', async () => {
  const d = offline();
  for (const [name, match] of [['board_init','exact'], ['BoardInit','exact'], ['course_board_init','inferred'],
    ['MyCourseBoardInit','inferred'], ['app_system_clock_config','inferred']]) {
    const r = await d.generalResult(name);
    assert.equal(r.match, match, name); assert.ok(r.candidates[0].summary);
    assert.match(hoverMarkdown(r), match === 'inferred' ? /名称推测/ : /命名约定/);
  }
  for (const name of ['board_deinit', 'init', 'my_init', 'my_uint16_t', 'UINT16_T', 'my_board_init_extra']) {
    assert.equal(await d.generalResult(name), undefined, name);
  }
  assert.match((await d.generalResult('uint16_t')).candidates[0].name, /16 位/);
});
test('project explanations and off mode take precedence; general lookup never calls Bing', async () => {
  const entry = { symbol:'course_board_init', kind:'function', name_zh:'本项目初始化', summary_zh:'准备项目硬件。',
    description_zh:'288 MHz', source:{file:'board.c',line:68} };
  let calls = 0;
  const t = new DaiguaTranslate([{name:'project',version:'1',entries:[entry]}], async () => { calls++; throw Error('network'); });
  assert.equal((await t.queryResult(entry.symbol,'online',offline())).kind,'project');
  assert.equal((await t.queryResult(entry.symbol,'off',offline())).kind,'project');
  assert.equal(await t.queryResult('app_board_init','off',offline()), undefined);
  assert.equal((await t.queryResult('app_board_init','online',offline())).match,'inferred');
  assert.equal(calls, 0);
});
test('external library overrides general entries; exact normalized beats longer prefix guessing', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'daigua-general-'));
  t.after(() => fs.rmSync(dir,{recursive:true,force:true}));
  const file = path.join(dir,'terms.json');
  const term = (token, translation) => ({ token, translation, match:'identifier', summary_zh:'通用用途。',
    reading:'unknown',source:'fixture',review_status:'unreviewed' });
  fs.writeFileSync(file,JSON.stringify({format_version:1,entries:[term('board_init','覆盖释义'),term('course_board_init','完整释义')]}));
  const d=offline([file]);
  assert.equal((await d.generalResult('BoardInit')).candidates[0].name,'覆盖释义');
  const result=await d.generalResult('app_course_board_init');
  assert.equal(result.matchedName,'course_board_init'); assert.equal(result.candidates[0].name,'完整释义');
});
test('every shipped project summary is present; daily UI omits implementation metadata, debug retains it', async () => {
  const report=await new KnowledgeLoader().loadWithReport([path.resolve(__dirname,'../../knowledge-packs/enhanced/05_createtask-pack.phonetic.json')]);
  assert.deepEqual(report.failures,[]);
  for(const entry of report.packs[0].entries) {
    assert.ok(entry.summary_zh,entry.symbol);
    for(const parameter of entry.parameters||[]) assert.ok(parameter.summary_zh,parameter.name);
  }
  const entry=report.packs[0].entries.find(e=>e.symbol==='course_board_init');
  entry.uncertainty='raw implementation note: 288 MHz in course_board.c';
  const r=projectResult(entry.symbol,[entry]);
  for(const render of [hoverMarkdown,resultHtml]) {
    const daily=render(r);
    assert.match(daily,/板级初始化/);assert.match(daily,/时钟和基础外设/);
    assert.doesNotMatch(daily,/288|MHz|AI-initial|ECDICT:|course_board\.c|英式优先|声明：|返回值：/);
    assert.match(render(r,true),/288 MHz/);assert.match(render(r,true),/course_board\.c/);
  }
});
test('old packs never leak a long description; ambiguous candidates keep owners and concise names', () => {
  const r=projectResult('arg',[{symbol:'arg',name_zh:'参数',owner:'worker',description_zh:'secret detail',source:{file:'private.c'}},
    {symbol:'arg',name_zh:'缓冲区参数',owner:'writer',source:{file:'other.c'}}]);
  for(const render of [hoverMarkdown,resultHtml]) {
    const text=render(r);assert.match(text,/worker/);assert.match(text,/writer/);assert.match(text,/音标暂缺/);
    assert.doesNotMatch(text,/secret detail|private\.c/);
  }
});
test('untrusted Markdown, HTML and command content is escaped in all result fields and debug', () => {
  const evil='<img src=x onerror=alert(1)> [click](command:evil) **bold**\n# heading';
  const r=projectResult(evil,[{symbol:'x',name_zh:evil,summary_zh:evil,uncertainty:evil,source:{file:'x.c'}}]);
  const html=resultHtml(r,true);assert.ok(!html.includes('<img'));assert.match(html,/&lt;img/);
  const md=hoverMarkdown(r,true);
  const prose = md.replace(/```json[\s\S]*?```/g, '');
  assert.ok(!prose.includes('[click](command:evil)'));
  assert.match(md,/\\\[click\\\]/);
  assert.equal((prose.match(/\]\(command:/g)||[]).length,2);
});

test('hover preserves phonetic apostrophes for candidates and dictionary components', () => {
  const pronunciation = (text, phonetic) => ({ segments: [{ text, phonetic, reading:'word', status:'resolved', source:'fixture' }] });
  const r = { text:'ek_indication_is_terminal', kind:'dictionary', match:'components', candidates:[], diagnostics:[],
    components:[{ text:'indication', meanings:['指示'], pronunciation:pronunciation('indication', ".indi'keiʃәn") },
      { text:'terminal', meanings:['终端机'], pronunciation:pronunciation('terminal', "'tә:minәl") }] };
  for (const result of [r, { ...r, components:[], candidates:r.components.map(c => ({ name:c.meanings[0], pronunciation:c.pronunciation })) }]) {
    const md = hoverMarkdown(result);
    assert.ok(md.includes("indication /\\.indi'keiʃәn/"));
    assert.ok(md.includes("terminal /'tә:minәl/"));
    assert.doesNotMatch(md, /&#39;|&amp;/);
    assert.ok(resultHtml(result).includes('&#39;'), 'HTML panel retains its own escaping');
  }
  assert.equal(escapeMarkdown('"quoted" & <tag> &#39;'), '"quoted" \\& \\<tag\\> \\&\\#39;');
});
test('dictionary output presents first sense, keeps other senses expandable, and hides fallback errors', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daigua-senses-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({format_version:1,source_sha256:'a'.repeat(64),shards:{mo:'mo.json'}}));
  fs.writeFileSync(path.join(dir,'mo.json'),JSON.stringify({motor:[{word:'motor',translation:'马达\\n发动机\n驱动装置',phonetic:'test'}]}));
  const d=new OfflineDictionary(()=>({dictionaryPath:dir,technicalLibraryPaths:[]}));
  const t1=new DaiguaTranslate([],async()=>{throw Error('transport-secret');});
  const r=await t1.queryResult('Motor','online',d);
  assert.match(hoverMarkdown(r),/马达/);assert.doesNotMatch(hoverMarkdown(r),/发动机|transport-secret|ECDICT:/);
  assert.match(resultHtml(r),/<details><summary>其余 2 条词义/);
  assert.match(resultHtml(r,true),/transport-secret/);
});
