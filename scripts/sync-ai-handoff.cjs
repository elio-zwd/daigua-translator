/** Keep the shipped prompt identical to the maintained handoff document. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
fs.copyFileSync(path.join(root, 'docs/external-ai-handoff.md'), path.join(root, 'plugin/resources/external-ai-handoff.md'));
