/**
 * test-plugin.js
 * 呆瓜翻译器 - 本地与回退集成测试脚本
 */

const path = require('path');
const { KnowledgeLoader } = require('../plugin/out/knowledge-loader');
const { isLikelySingleSymbol, normalizeSymbol, formatEntry, formatEntries } = require('../plugin/out/symbol-matcher');
const { DaiguaTranslate } = require('../plugin/out/daigua-translate');

async function runTests() {
  console.log('=== 呆瓜翻译器功能验证 ===\n');

  const packPath = path.resolve(__dirname, '../knowledge-packs/05_createtask-pack.json');
  const loader = new KnowledgeLoader();
  const packs = await loader.loadFromPaths([packPath]);

  console.log(`已载入知识包数量: ${packs.length}`);

  const translator = new DaiguaTranslate(packs);

  // 测试 1: 精确符号查询 (带括号)
  const query1 = 'worker()';
  console.log(`\n测试 1: 查询已收录函数 [${query1}]`);
  const res1 = await translator.translate(query1, { to: 'zh-CN' });
  console.log(res1);

  // 测试 2: 精确变量查询
  const query2 = 'intervals';
  console.log(`\n测试 2: 查询已收录变量 [${query2}]`);
  const res2 = await translator.translate(query2, { to: 'zh-CN' });
  console.log(res2);

  // 测试 3: 未收录符号回退到 Bing
  const query3 = 'NonExistentUnknownSymbol';
  console.log(`\n测试 3: 查询未收录符号回退到 Bing [${query3}]`);
  const res3 = await translator.translate(query3, { to: 'zh-CN' });
  console.log(`Bing 回退结果: ${res3}`);

  console.log('\n=== 验证完成 ===');
}

runTests().catch(err => {
  console.error('测试出错:', err);
  process.exit(1);
});
