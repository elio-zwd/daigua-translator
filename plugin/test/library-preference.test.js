const test = require('node:test');
const assert = require('node:assert/strict');
const { LibraryPreference } = require('../out/library-preference');
const memento = () => {
  const map = new Map();
  return { get:key=>map.get(key), update:async(key,value)=>{ if(value===undefined)map.delete(key);else map.set(key,structuredClone(value)); } };
};
function fixture() {
  const state = {registered:false,global:undefined,workspace:undefined,error:undefined,writes:[],log:[]};
  const stores = {global:memento(),workspace:memento()};
  const config = () => ({
    inspect:()=>({defaultValue:state.registered?'':undefined,globalValue:state.global,workspaceValue:state.workspace}),
    get:()=>state.workspace??state.global??'',
    update:async(key,value,target)=>{
      if(state.error)throw state.error;
      state[target===1?'global':'workspace']=value;state.writes.push({key,value,target});
    },
  });
  const fresh=()=>new LibraryPreference(config,stores,m=>state.log.push(m));
  return {state,stores,fresh,preference:fresh()};
}
test('missing configuration registration saves immediately, persists restart and migrates when registered',async()=>{
  const {state,preference,fresh}=fixture();
  await preference.save('  M:\\词库  ');assert.equal(preference.get(),'M:\\词库');assert.equal(state.writes.length,0);
  const restarted=fresh();assert.equal(restarted.get(),'M:\\词库');
  state.registered=true;await restarted.reconcile();
  assert.equal(state.global,'M:\\词库');assert.equal(fresh().get(),'M:\\词库');
  assert.match(restarted.diagnostics(),/待同步用户选择：false/);
});
test('schema disagreement during native update falls back only for registration errors',async()=>{
  const {state,preference}=fixture();state.registered=true;
  state.error=Error('CodeExpectedError: 没有注册配置 daiguaTranslate.libraryDirectory，因此无法写入 用户设置。');
  await preference.save('M:\\chosen');assert.equal(preference.get(),'M:\\chosen');
  state.error=Error('Permission denied');
  await assert.rejects(preference.save('M:\\must-not-apply'),/Permission/);
  assert.equal(preference.get(),'M:\\chosen');
});
test('empty removal persists and workspace selections do not leak to another workspace',async()=>{
  const {state,preference,stores}=fixture();state.workspace='M:\\old';state.global='M:\\global';
  await preference.save('M:\\new');assert.equal(preference.get(),'M:\\new');
  await preference.save('');assert.equal(preference.get(),'');
  const other=new LibraryPreference(()=>({inspect:()=>({defaultValue:undefined,globalValue:state.global}),get:()=>state.global}),{global:stores.global,workspace:memento()});
  assert.equal(other.get(),'M:\\global');
  state.registered=true;await preference.reconcile();assert.equal(state.workspace,'');assert.equal(state.global,'M:\\global');
});
test('later explicit native settings win over pending selections; failed persistence never reports applied data',async()=>{
  const {state,preference,stores}=fixture();
  await preference.save('M:\\pending');state.global='M:\\manually-changed';state.registered=true;
  await preference.reconcile();assert.equal(preference.get(),'M:\\manually-changed');assert.equal(state.writes.length,0);
  state.registered=false;stores.global.update=async()=>{throw Error('storage unavailable');};
  await assert.rejects(preference.save('M:\\not-saved'),/storage unavailable/);
  assert.equal(preference.get(),'M:\\manually-changed');
});
test('workspace native value overrides global recovery and whitespace-only directory means no selection',async()=>{
  const {state,preference}=fixture();await preference.save('M:\\global-pending');
  state.workspace='M:\\workspace';assert.equal(preference.get(),'M:\\workspace');
  state.workspace='   ';assert.equal(preference.get(),'');
});
test('invalid native workspace directory can be replaced without a silent global-only save',async()=>{
  const {state,preference}=fixture();state.registered=true;state.workspace=['invalid'];
  assert.equal(preference.get(),'');
  await preference.save('M:\\fixed');
  assert.equal(state.writes.at(-1).target,2);assert.equal(preference.get(),'M:\\fixed');
});
test('Windows case and slash aliases do not discard a newer pending directory selection',async()=>{
  const {state,preference}=fixture();state.global='m:\\Old\\Library\\';
  await preference.save('M:\\new-library');
  state.global='M:/old/library';state.registered=true;
  assert.equal(preference.get(),'M:\\new-library');
  await preference.reconcile();assert.equal(state.global,'M:\\new-library');
});
