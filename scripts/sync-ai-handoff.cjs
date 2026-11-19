/** Keep the shipped prompts identical to the maintained handoff documents. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const resources = path.join(root, 'plugin/resources');
fs.mkdirSync(resources, { recursive: true });
for (const name of ['external-ai-handoff.md', 'missing-terms-handoff.md']) {
  fs.copyFileSync(path.join(root, 'docs', name), path.join(resources, name));
}
