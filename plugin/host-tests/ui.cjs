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
  // Keep this regression offline and independent of the user's ECDICT installation.
  const dictionary = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'hover-dictionary');
  fs.mkdirSync(dictionary);
  const words = [
    ['ek', '柯达公司', ''], ['indication', '指示', ".indi'keiʃәn"],
    ['is', 'be的现在式第三人称', 'iz'], ['terminal', '终端机', "'tә:minәl"],
    ['markup', '"quoted" & <img src=x> [click](command:evil) **bold** &#39;', 'test'],
    ['interrupt', '中断', 'ɪntə'], ['request', '请求', 'rɪkwest'],
    ['static', '静态', "'stætik"], ['statically', '静态地', "'stætikli"],
    ['parse', '解析', 'pɑ:s'], ['frame', '帧', 'freim'],
    ['flash', '闪光', 'flæʃ'], ['low', '低', 'ləʊ'], ['level', '水平', 'levəl'],
  ];
  const shards = {};
  for (const [word, translation, phonetic] of words) {
    const file = word.slice(0, 2) + '.json';
    shards[word.slice(0, 2)] = file;
    const shardPath = path.join(dictionary, file);
    const shard = fs.existsSync(shardPath) ? JSON.parse(fs.readFileSync(shardPath, 'utf8')) : {};
    shard[word] = [{ word, translation, phonetic }];
    fs.writeFileSync(shardPath, JSON.stringify(shard));
  }
  fs.writeFileSync(path.join(dictionary, 'manifest.json'), JSON.stringify({ format_version:1, source_sha256:'a'.repeat(64), shards }));
  await config.update('dictionaryPath', dictionary, 2);
  const libraryDirectory = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'library');
  fs.cpSync(path.join(root, 'dictionaries'), libraryDirectory, { recursive: true });
  const catalog = JSON.parse(fs.readFileSync(path.join(libraryDirectory, 'library.json'), 'utf8'));
  catalog.dictionary_path = dictionary;
  for (const project of catalog.projects) project.source_roots = [];
  const currentRoot = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'current');
  require('../../tests/fixtures/cross-project.cjs')(catalog, libraryDirectory, currentRoot);
  fs.writeFileSync(path.join(libraryDirectory, 'library.json'), JSON.stringify(catalog));
  await config.update('libraryDirectory', libraryDirectory, 2);
  await vscode.commands.executeCommand('daiguaTranslate.reloadPacks');
  const names = ['course_board_init' , 'app_board_init', 'uint16_t', 'very_long_project_prefix_with_many_words_board_init',
    'ek_indication_is_terminal_sample', 'markup', 'cross_function', 'shared_arg', 'gIRQ', 'p_mac', 's_count', 'static',
    'statically', 'g_pBuffer', 'pucBuffer', 'parse_frame', 'sFLASH_LowLevel_Init'];
  fs.mkdirSync(currentRoot, { recursive: true });
  const sourceFile = path.join(currentRoot, 'probe.c');
  fs.writeFileSync(sourceFile, '// Concise word lookup\n\n' + names.map(name => `${name};`).join('\n') + '\n');
  const document = await vscode.workspace.openTextDocument(sourceFile);
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
  const originalBing = api.translator.bingTranslator;
  let releaseSupplement, pendingReader, pendingReaderError;
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
        else if (url.pathname === '/supplement-setup') {
          api.translator.bingTranslator = () => new Promise(resolve => { releaseSupplement = resolve; });
          await config.update('bingEnabled', true, 2);
          await config.update('hoverFallback', 'online', 2);
        } else if (url.pathname === '/reader-start') {
          pendingReaderError = undefined;
          pendingReader = showWord(url.searchParams.get('word')).catch(error => { pendingReaderError = error; });
        } else if (url.pathname === '/supplement-release') {
          if (!releaseSupplement) throw Error('Supplement request has not started');
          api.translator.bingTranslator = async () => ({translation:'闪存底层初始化'});
          releaseSupplement({translation:'闪存底层初始化'});
          await pendingReader;
          if (pendingReaderError) throw pendingReaderError;
        }
        else if (url.pathname === '/online-setup') {
          api.translator.bingTranslator = async () => ({ translation: '静态' });
          await config.update('bingEnabled', true, 2);
          await config.update('hoverFallback', 'online', 2);
        } else if (url.pathname === '/online-reset') {
          await config.update('hoverFallback', 'ecdict', 2);
          await config.update('bingEnabled', false, 2);
          api.translator.bingTranslator = originalBing;
        }
        else if (url.pathname === '/select') {
          const line = Number(url.searchParams.get('line'));
          if (!Number.isInteger(line) || line < 0 || line >= names.length) throw Error('Invalid selection');
          const editor = await vscode.window.showTextDocument(document, 1);
          editor.selection = new vscode.Selection(line + 2, 2, line + 2, 2);
        } else if (url.pathname === '/settings') await vscode.commands.executeCommand('daiguaTranslate.openSettings');
        else if (url.pathname === '/picker') {
          const mode = url.searchParams.get('mode');
          pickerResult = mode === 'cancel' ? undefined : [vscode.Uri.file(mode === 'invalid' ? dictionary : libraryDirectory)];
        }
        else if (url.pathname === '/layout') {
          const ratio = Number(url.searchParams.get('ratio'));
          if (ratio < .2 || ratio > .7) throw Error('Invalid ratio');
          await vscode.commands.executeCommand('vscode.setEditorLayout', { orientation: 0, groups: [{ size: 1 - ratio }, { size: ratio }] });
        } else if (url.pathname === '/hover') {
          const editor = await vscode.window.showTextDocument(document, 1);
          const index = names.indexOf(url.searchParams.get('word'));
          if (index >= 0) editor.selection = new vscode.Selection(index + 2, 2, index + 2, 2);
          await vscode.commands.executeCommand('editor.action.showHover');
        } else if (url.pathname === '/hide-hover') await vscode.commands.executeCommand('editor.action.hideHover');
        res.end(JSON.stringify({ ok: true, result: api.panels.result?.text, locked: api.panels.locked,
          clipboard: url.pathname === '/clipboard' ? await vscode.env.clipboard.readText() : undefined,
          libraryDirectory: vscode.workspace.getConfiguration('daiguaTranslate').get('libraryDirectory', ''),
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
