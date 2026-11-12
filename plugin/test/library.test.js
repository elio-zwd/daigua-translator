const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadLibrary, identifyProject, validateCatalog } = require('../out/library-catalog');
const { OfflineDictionary } = require('../out/offline-dictionary');
const { DaiguaTranslate } = require('../out/daigua-translate');
const { hoverMarkdown, resultHtml } = require('../out/result-renderer');
const addCrossProjects = require('../../tests/fixtures/cross-project.cjs');
for (const item of require('../../tests/fixtures/catalog-validation.json')) {
  test(`Python/plugin catalog contract: ${item.name}`, () => {
    if (item.valid) assert.doesNotThrow(()=>validateCatalog(item.catalog,process.cwd()));
    else assert.throws(()=>validateCatalog(item.catalog,process.cwd()));
  });
}
const write = (directory, file, value) => {
  fs.mkdirSync(path.dirname(path.join(directory, file)), {recursive:true});
  fs.writeFileSync(path.join(directory, file), JSON.stringify(value));
};
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daigua-catalog-'));
  t.after(() => fs.rmSync(directory, {recursive:true,force:true}));
  const catalog = {format_version:1,word_libraries:['words/terms.json'],naming_libraries:['naming/terms.json'],projects:[]};
  const term = {token:'EK',match:'insensitive',translation:'熠日照明',reading:'unknown',source:'user-confirmed:fixture',review_status:'confirmed'};
  write(directory, 'words/terms.json', {format_version:1,entries:[term]});
  write(directory, 'naming/terms.json', {format_version:1,entries:[{...term,token:'board_init',match:'identifier',translation:'板级初始化',summary_zh:'准备基础外设。'}]});
  addCrossProjects(catalog, directory, 'C:\\work\\current');
  write(directory, 'library.json', catalog);
  return {directory,catalog};
}
test('catalog loads only listed files, validates roles and rejects aliases across categories', async t => {
  const {directory,catalog}=fixture(t);
  write(directory,'backup.json',{broken:true});
  const s=await loadLibrary(directory);
  assert.deepEqual(s.counts,{words:1,naming:1,symbols:30});assert.equal(s.failures.length,0);
  assert.throws(()=>validateCatalog({...catalog,naming_libraries:['WORDS/terms.json']},directory),/重复/);
  assert.throws(()=>validateCatalog({...catalog,word_libraries:['../outside.json']},directory),/相对路径/);
  write(directory,'words/terms.json',{format_version:1,entries:[{...s.naming[0][0]}]});
  const bad=await loadLibrary(directory,s);assert.equal(bad.failures[0].retained,true);assert.equal(bad.counts.words,1);
});
test('edited and corrupt files retain last valid data; removed files disappear, including deleted sources', async t => {
  const {directory,catalog}=fixture(t);const before=await loadLibrary(directory);
  fs.writeFileSync(path.join(directory,'symbols/probe-current.json'),'{broken');
  fs.unlinkSync(path.join(directory,'words/terms.json'));
  const retained=await loadLibrary(directory,before);
  assert.equal(retained.failures.length,2);assert.ok(retained.failures.every(f=>f.retained));
  catalog.word_libraries=[];catalog.projects=catalog.projects.filter(p=>p.id!=='probe-current');
  write(directory,'library.json',catalog);
  const removed=await loadLibrary(directory,retained);
  assert.equal(removed.counts.words,0);assert.equal(removed.packs.length,5);
  assert.ok(!removed.files.includes(path.join(directory,'symbols/probe-current.json')));
});
test('Windows project matching uses segment boundaries, longest roots, conflicts and no-document references', () => {
  const p=(id,roots)=>({id,name:id,source_roots:roots,symbol_libraries:[]});
  const projects=[p('a',['C:\\Work\\App']),p('b',['C:\\work\\app\\nested'])];
  assert.equal(identifyProject('c:/WORK/app/a.c',projects).id,'a');
  assert.equal(identifyProject('C:\\Work\\App2\\a.c',projects).id,undefined);
  assert.equal(identifyProject('C:\\Work\\App\\nested\\a.c',projects).id,'b');
  assert.equal(identifyProject(undefined,projects).id,undefined);
  const conflict=identifyProject('C:\\work\\app\\a.c',[...projects,p('c',['c:/work/app'])]);
  assert.equal(conflict.id,undefined);assert.equal(conflict.diagnostics.length,1);
});
test('all source kinds and parameters share current-first, exact dedup and three additional references', async t => {
  const {directory}=fixture(t);const s=await loadLibrary(directory);
  const offline=new OfflineDictionary(()=>({dictionaryPath:'',technicalLibraryPaths:[],termLibraries:[...s.words,...s.naming]}));
  const translator=new DaiguaTranslate(s.packs,async()=>{throw Error('must remain offline');},undefined,()=>({projects:s.projects}));
  for(const name of ['cross_function','cross_variable','cross_macro','cross_enum','cross_typedef','shared_arg']) {
    const r=await translator.queryResult(name,'online',offline,'c:/work/current/probe.c');
    assert.equal(r.candidates.length,4,name);assert.equal(r.candidates[0].relation,'current');
    assert.equal(r.candidates[0].origins.length,2,name);
    assert.deepEqual(r.candidates.slice(1).map(c=>c.relation),['reference','reference','reference']);
    assert.ok(!hoverMarkdown(r).includes('参考四'));assert.ok(!resultHtml(r).includes('private/probe.c'));
    assert.ok(resultHtml(r,true).includes('unreviewed duplicate provenance'));
    const unknown=await translator.queryResult(name,'off',offline);
    assert.equal(unknown.candidates.length,3);assert.ok(unknown.candidates.every(c=>c.relation==='reference'));
  }
  assert.equal(translator.sourceResult('CROSS_FUNCTION'),undefined);
  const ek=await translator.queryResult('ek_indication_is_terminal','online',offline);
  assert.deepEqual(ek.components[0].meanings,['熠日照明']);
  assert.equal((await translator.queryResult('app_board_init','online',offline)).match,'inferred');
});
test('no configured data means no hidden technical terms or naming conventions', async () => {
  const d=new OfflineDictionary(()=>({dictionaryPath:'',technicalLibraryPaths:[]}));
  assert.equal(await d.generalResult('board_init'),undefined);
  assert.equal(await d.hasLocalTerms('GPIO_EK'),false);
});
test('same wording under different parameter owners remains distinct', () => {
  const {projectResult}=require('../out/query-result');
  const base={symbol:'arg',kind:'variable',name_zh:'参数',summary_zh:'输入数据。',source:{file:'a.c'}};
  const r=projectResult('arg',[{...base,owner:'read'},{...base,owner:'write'}]);
  assert.equal(r.candidates.length,2);
});
