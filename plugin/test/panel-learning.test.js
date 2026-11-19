const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { OfflineDictionary, validateTerms } = require('../out/offline-dictionary');
const { panelResultHtml, hoverMarkdown } = require('../out/result-renderer');
const { DaiguaTranslate } = require('../out/daigua-translate');
const term = (token, translation, extra={}) => ({token,translation,match:'exact',reading:'unknown',source:'fixture',review_status:'unreviewed',...extra});
const ipa = (text, phonetic) => ({text,phonetic,reading:'word',status:'resolved',source:'authored',review_status:'unreviewed'});
function fixture(t, entries) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daigua-learning-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const rows = [['msg','味精',''],['app','应用',''],['handler','处理者\\n拳击教练','hand'],['application','应用程序','application'],
    ['message','消息\\n通知','message'],['advertising','广告业','adv'],['bluetooth','蓝牙',''],['low','低','low'],['energy','能量','energy']];
  const shards={};
  for(const [word,translation,phonetic] of rows) {
    const key=word.slice(0,2), file=path.join(dir,key+'.json'); shards[key]=key+'.json';
    const shard=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
    shard[word]=[{word,translation,phonetic}];fs.writeFileSync(file,JSON.stringify(shard));
  }
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({format_version:1,source_sha256:'a'.repeat(64),shards}));
  const d=new OfflineDictionary(()=>({dictionaryPath:dir,technicalLibraryPaths:[],termLibraries:[entries]}));
  return {d,dir};
}
const entries = () => [term('BLE','低功耗蓝牙',{match:'insensitive',expansion:'Bluetooth Low Energy',reading:'letters',phonetic:'ble'}),
  term('ADV','广播',{expansion:'advertising',inference:{requires_tokens:['ble'],context_zh:'蓝牙名称'}}),
  term('APP','应用',{expansion:'application',learning_only:true}),term('MSG','消息',{expansion:'message',learning_only:true})];

test('source hit gets independent full learning data; technical inference does not change hover',async t=>{
  const {d}=fixture(t,entries());
  const name='app_ble_adv_msg_handler';
  const pack={name:'fixture',version:'1',entries:[{symbol:name,kind:'function',name_zh:'广播消息处理',summary_zh:'处理广播变化。',source:{file:'app.c'},pronunciation:{segments:name.split('_').map((s,i)=>ipa(s,'source-'+i))}}]};
  const translator=new DaiguaTranslate([pack]);
  const r=await translator.queryResult(name,'off',d), before=JSON.stringify(r), hover=hoverMarkdown(r);
  const learning=await d.panelLearning(r), html=panelResultHtml(r,learning);
  assert.deepEqual(learning.items.map(i=>i.text),name.split('_'));
  assert.equal(learning.items[2].branches[0].meanings[0].text,'广播');
  assert.deepEqual(learning.items[2].branches[0].rule.inference.requires_tokens,['ble']);
  assert.equal(learning.items[3].branches[0].meanings[0].basis,'inferred');
  assert.equal(learning.items[3].dictionaryMeanings[0].text,'味精');
  assert.equal(learning.items[1].branches[0].expansion.words[0].pronunciation,undefined);
  assert.match(html,/部分音标暂缺/);assert.match(html,/其他词典含义/);assert.match(html,/拳击教练/);
  assert.match(html,/source-4/);assert.doesNotMatch(html,/<details|名称补充|音标：app/);
  assert.equal(JSON.stringify(r),before);assert.equal(hoverMarkdown(r),hover);
  assert.doesNotMatch(hover,/名称推测|application|message/);
  assert.equal(await d.hasLocalTerms('msg_handler'),false);
  assert.equal(await d.hasExactWord('MSG'),false);
  assert.equal(await d.panelLearning(r),learning,'same snapshot reuses bounded cache');
});

test('unmet context is a possibility; duplicate positions, ambiguity and formal matches stay separate',async t=>{
  const {d}=fixture(t,[...entries(),term('X','甲',{learning_only:true}),term('X','乙',{learning_only:true})]);
  const r={text:'adv_msg_msg_x',kind:'dictionary',match:'components',candidates:[],diagnostics:[]};
  const l=await d.panelLearning(r);
  assert.match(l.items[0].branches[0].context,/条件未满足/);
  assert.equal(l.items[0].branches[0].applicable,false);
  assert.match(panelResultHtml(r,{...l,items:[l.items[0]]}),/名称推测 · 可能含义/);
  assert.notEqual(l.items[1].id,l.items[2].id);
  assert.equal(l.items[3].branches.length,2);
  assert.match(panelResultHtml(r,l),/可能含义 2/);
  const formal=fixture(t,[...entries(),term('msg','正式消息')]);
  const f=await formal.d.panelLearning({...r,text:'msg'});
  assert.equal(f.items[0].branches[0].meanings[0].basis,'library');
  assert.equal(f.items[0].branches[0].meanings[0].text,'正式消息');
  const multiple=fixture(t,[term('msg','正式消息'),term('msg','正式通信')]);
  const formalResult={...r,text:'msg'};
  assert.doesNotMatch(panelResultHtml(formalResult,await multiple.d.panelLearning(formalResult)),/名称推测/);
});

test('conflicting authored readings stay missing; misaligned and repeated readings never get redistributed',async t=>{
  const {d}=fixture(t,[]);
  const r={text:'handler_handler',kind:'project',match:'exact',diagnostics:[],candidates:[
    {name:'A',pronunciation:{segments:[ipa('handler','first'),ipa('handler','second')]}},
    {name:'B',pronunciation:{segments:[ipa('handler','different'),ipa('handler','second')]}}]};
  const l=await d.panelLearning(r);
  assert.equal(l.items[0].pronunciation,undefined);
  assert.equal(l.items[1].pronunciation.segments[0].phonetic,'second');
  assert.match(l.diagnostics.join(' '),/源码读音冲突/);
  const m=await d.panelLearning({...r,candidates:[{name:'A',pronunciation:{segments:[ipa(r.text,'whole')]}}]});
  assert.ok(m.diagnostics.includes('部分读音无法逐词对应'));
  assert.ok(m.items.every(i=>i.pronunciation.segments[0].phonetic==='hand'));
});

test('missing dictionary, numbers, prefix boundaries, HTML and cache reset preserve safe results',async()=>{
  let terms=[term('MSG','<img src=x>',{learning_only:true,expansion:'<unsafe> message'})];
  const d=new OfflineDictionary(()=>({dictionaryPath:'',technicalLibraryPaths:[],termLibraries:[terms]}));
  const r={text:'msg_16_t',kind:'project',match:'exact',candidates:[{name:'16 位类型'}],diagnostics:[]};
  const l=await d.panelLearning(r), html=panelResultHtml(r,l,true);
  assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);assert.match(html,/16 位类型/);
  assert.equal(l.items[1].numeric,true);assert.match(html,/未标注读音/);
  terms=[];
  const updated=await d.panelLearning(r);
  assert.equal(updated.items[0].meanings[0].basis,'missing');
  const pending=d.panelLearning({...r,text:'other'});d.reset();
  await assert.rejects(pending,/配置已变化/);
});

test('learning metadata validates without extending ordinary or prefix matching',()=>{
  for(const extra of [{learning_only:'true'},{learning_only:true,match:'prefix'},{inference:[]},{inference:{aliases:[]}},
    {inference:{requires_tokens:['bad_1']}},{inference:{context_zh:7}},{inference:{typo:true}}]) {
    assert.throws(()=>validateTerms({format_version:1,entries:[term('MSG','消息',extra)]}));
  }
  assert.equal(validateTerms({format_version:1,entries:entries()}).length,4);
});
