/** Dedicated, isolated visual-test host. Driven only by scripts/test-ui.cjs. */
const vscode = require('vscode');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');

exports.run = async function () {
  const port = Number(process.env.DAIGUA_UI_PORT);
  if (!port) throw Error('Use node scripts/test-ui.cjs');
  const root = path.resolve(__dirname, '../..');
  const config = vscode.workspace.getConfiguration('daiguaTranslate');
  await config.update('bingEnabled', false, 2);
  await config.update('hoverFallback', 'ecdict', 2);
  await config.update('packPaths', [path.join(root, 'knowledge-packs/enhanced/05_createtask-pack.phonetic.json')], 2);
  const extension = vscode.extensions.getExtension('elio-zwd.daigua-translator');
  const api = await extension.activate();
  await vscode.commands.executeCommand('daiguaTranslate.reloadPacks');
  await vscode.commands.executeCommand('workbench.action.closeSidebar');
  await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
  await vscode.commands.executeCommand('notifications.clearAll');
  const names = ['course_board_init', 'app_board_init', 'uint16_t', 'very_long_project_prefix_with_many_words_board_init'];
  const document = await vscode.workspace.openTextDocument({ language: 'c', content:
    '// Concise word lookup\n\n' + names.map(name => `${name};`).join('\n') + '\n' });
  const showWord = async name => {
    const editor = await vscode.window.showTextDocument(document, 1);
    const line = names.indexOf(name) + 2;
    if (line >= 2) editor.selection = new vscode.Selection(line, 2, line, 2);
    await vscode.commands.executeCommand('daiguaTranslate.openDetails', name);
  };
  await showWord(names[0]);
  const originalClipboard = await vscode.env.clipboard.readText();
  const expectedClipboard = fs.readFileSync(path.join(root, 'plugin/resources/external-ai-handoff.md'), 'utf8');
  // Supply a deterministic picker result in this isolated host; no native dialog input.
  const originalOpenDialog = vscode.window.showOpenDialog;
  let pickerResult;
  vscode.window.showOpenDialog = async () => pickerResult;
  await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname === '/theme') {
          const theme = url.searchParams.get('name');
          if (!['Default Dark Modern', 'Default Light Modern', 'Default High Contrast'].includes(theme)) throw Error('Invalid theme');
          await vscode.workspace.getConfiguration('workbench').update('colorTheme', theme, 2);
        } else if (url.pathname === '/reader') await showWord(url.searchParams.get('word') || names[0]);
        else if (url.pathname === '/select') {
          const line = Number(url.searchParams.get('line'));
          if (!Number.isInteger(line) || line < 0 || line >= names.length) throw Error('Invalid selection');
          const editor = await vscode.window.showTextDocument(document, 1);
          editor.selection = new vscode.Selection(line + 2, 2, line + 2, 2);
        } else if (url.pathname === '/settings') await vscode.commands.executeCommand('daiguaTranslate.openSettings');
        else if (url.pathname === '/picker') {
          const mode = url.searchParams.get('mode');
          pickerResult = mode === 'cancel' ? undefined : [vscode.Uri.file(path.join(root,
            mode === 'invalid' ? 'plugin/package.json' : 'knowledge-packs/dfu-20261110/general-terms.json'))];
        }
        else if (url.pathname === '/layout') {
          const ratio = Number(url.searchParams.get('ratio'));
          if (ratio < .2 || ratio > .7) throw Error('Invalid ratio');
          await vscode.commands.executeCommand('vscode.setEditorLayout', { orientation: 0, groups: [{ size: 1 - ratio }, { size: ratio }] });
        } else if (url.pathname === '/hover') {
          await vscode.window.showTextDocument(document, 1);
          await vscode.commands.executeCommand('editor.action.showHover');
        }
        res.end(JSON.stringify({ ok: true, result: api.panels.result?.text, locked: api.panels.locked,
          clipboard: url.pathname === '/clipboard' ? await vscode.env.clipboard.readText() : undefined,
          technicalLibraryPaths: vscode.workspace.getConfiguration('daiguaTranslate').get('technicalLibraryPaths', []),
          debug: vscode.workspace.getConfiguration('daiguaTranslate').get('debugMode', false), vscode: vscode.version }));
        if (url.pathname === '/finish') {
          vscode.window.showOpenDialog = originalOpenDialog;
          // Restore only the clipboard value written by this test.
          if (await vscode.env.clipboard.readText() === expectedClipboard)
            await vscode.env.clipboard.writeText(originalClipboard);
          server.close(); resolve();
        }
      } catch (error) { res.statusCode = 500; res.end(String(error)); }
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1');
  });
};
