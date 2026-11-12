/** Deterministic source candidates shared by unit, host and rendered UI checks. */
const fs = require('node:fs');
const path = require('node:path');
module.exports = function addCrossProjects(catalog, directory, sourceRoot) {
  const versions = [['same', '本工程解释'], ['one', '参考一'], ['two', '参考二'], ['three', '参考三'], ['four', '参考四'], ['current', '本工程解释']];
  for (const [id, meaning] of versions) {
    const relative = `symbols/probe-${id}.json`;
    const entries = ['function', 'variable', 'macro', 'enum', 'typedef'].map(kind => ({
      symbol: `cross_${kind}`, kind, name_zh: id === 'same' ? `  ${meaning}  ` : meaning,
      summary_zh: '一句话用途。', source: { file: 'private/probe.c', line: 1 },
      uncertainty: id === 'same' ? 'unreviewed duplicate provenance' : '',
      ...(kind === 'function' ? { parameters: [{ name: 'shared_arg', summary_zh: meaning }] } : {}),
    }));
    fs.mkdirSync(path.dirname(path.join(directory, relative)), { recursive: true });
    fs.writeFileSync(path.join(directory, relative), JSON.stringify({ name: id, version: '1', entries }));
    catalog.projects.push({ id: `probe-${id}`, name: `测试工程 ${id}`, source_roots: id === 'current' ? [sourceRoot] : [], symbol_libraries: [relative] });
  }
  return catalog;
};
