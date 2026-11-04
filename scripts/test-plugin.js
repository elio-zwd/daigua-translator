/** Offline by default. --online sends one generic English sentence to Bing. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { KnowledgeLoader } = require('../plugin/out/knowledge-loader');
const { DaiguaTranslate } = require('../plugin/out/daigua-translate');

async function run() {
  const online = process.argv.includes('--online');
  const loader = new KnowledgeLoader();
  const report = await loader.loadWithReport([
    path.resolve(__dirname, '../knowledge-packs/05_createtask-pack.json'),
    path.resolve(__dirname, '../examples/mcu-demo/demo-pack.json')
  ]);
  assert.deepEqual(report.failures, []);
  let requests = 0;
  const offline = new DaiguaTranslate(report.packs, async () => {
    requests++;
    throw new Error('offline: network disabled in this example transport');
  });
  for (const [symbol, expected] of [['worker()', '动态工作任务'], ['intervals', '任务周期数组'],
    ['Motor_Start', '启动电机演示'], ['local_count', '任务局部计数']]) {
    const result = await offline.translate(symbol, {});
    assert.ok(result.includes(expected), symbol);
    console.log(`PASS local/offline ${symbol}: ${result.split('\n')[0]}`);
  }
  assert.equal(requests, 0);
  await assert.rejects(offline.translate('Unrecorded_demo_symbol', {}), /offline/);
  assert.equal(requests, 1);
  console.log('PASS offline miss rejects (simulation; no system network settings changed)');
  const ambiguous = await loader.loadFromPaths([
    path.resolve(__dirname, '../examples/mcu-demo/demo-pack.json'),
    path.resolve(__dirname, '../examples/mcu-demo/ambiguity-pack.json')
  ]);
  assert.match(await new DaiguaTranslate(ambiguous).translate('Motor_Start', {}), /找到 2 个/);
  console.log('PASS ambiguous symbols show both candidates');
  if (online) {
    const timer = setTimeout(() => { console.error('FAIL Bing live request timed out after 25 seconds'); process.exit(1); }, 25000);
    try {
      const result = await new DaiguaTranslate([]).translate('The motor starts after initialization.', { from: 'en', to: 'zh-CN' });
      assert.ok(result.trim());
      console.log(`PASS Bing live result: ${result}`);
    } finally { clearTimeout(timer); }
  }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
