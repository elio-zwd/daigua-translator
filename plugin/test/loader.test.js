const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { KnowledgeLoader } = require('../out/knowledge-loader');
const { validateKnowledgePack } = require('../out/pack-validation');

const fixture = require('../../tests/fixtures/pack-validation.json');
for (const item of fixture) {
  test(`Python/plugin format contract: ${item.name}`, () => {
    if (item.valid) assert.doesNotThrow(() => validateKnowledgePack(item.pack));
    else assert.throws(() => validateKnowledgePack(item.pack));
  });
}

test('atomic pack load retains old content; removal forgets it; invalid first load is skipped', async () => {
  const a = path.resolve('a.json'), b = path.resolve('b.json');
  let files = new Map([[a, JSON.stringify(fixture[0].pack)], [b, '{broken']]);
  const loader = new KnowledgeLoader(async file => {
    if (!files.has(file)) throw new Error('ENOENT');
    return files.get(file);
  });
  const first = await loader.loadWithReport([a, a, b]);
  assert.equal(first.loadedCount, 1);
  assert.equal(first.packs.length, 1);
  assert.equal(first.failures[0].retained, false);
  files.set(a, JSON.stringify({ ...fixture[0].pack, entries: [...fixture[0].pack.entries, null] }));
  const retained = await loader.loadWithReport([a], first.byPath);
  assert.equal(retained.loadedCount, 0);
  assert.deepEqual(retained.packs, first.packs);
  assert.equal(retained.failures[0].retained, true);
  const removed = await loader.loadWithReport([], retained.byPath);
  assert.equal(removed.packs.length, 0);
  const readded = await loader.loadWithReport([a], removed.byPath);
  assert.equal(readded.packs.length, 0);
});

test('bundled knowledge packs load through the runtime validator', async () => {
  const report = await new KnowledgeLoader().loadWithReport([
    path.resolve(__dirname, '../../knowledge-packs/05_createtask-pack.json'),
    path.resolve(__dirname, '../../knowledge-packs/example/example-pack.json')
  ]);
  assert.deepEqual(report.failures, []);
  assert.equal(report.packs.length, 2);
});
