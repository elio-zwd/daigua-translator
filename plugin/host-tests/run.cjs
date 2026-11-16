/** Runs inside an isolated real VS Code extension host, not under node --test. */
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const vscode = require('vscode');

exports.run = async function () {
  const checks = [];
  const repository = path.resolve(__dirname, '../..');
  const port = Number(process.env.DAIGUA_HOST_PORT);
  assert.ok(port, 'Use scripts/test-vscode.ps1 with an isolated profile');
  const sendReport = data => new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => socket.end(JSON.stringify(data), resolve));
    socket.on('error', reject);
  });
  const config = vscode.workspace.getConfiguration('daiguaTranslate');
  const textOf = hovers => hovers.flatMap(h => h.contents.map(c => typeof c === 'string' ? c : c.value)).join('\n').replace(/&nbsp;/g, ' ');
  const hoverAt = async (doc, position) => textOf(await vscode.commands.executeCommand('vscode.executeHoverProvider', doc.uri, position));
  try {
    const extension = vscode.extensions.getExtension('elio-zwd.daigua-translator');
    assert.ok(extension);
    const recovery = process.env.DAIGUA_SCHEMA_RECOVERY_PHASE;
    if (recovery) {
      console.log('[schema recovery] phase=' + recovery);
      const directory = path.join(repository, 'dictionaries');
      if (recovery === 'missing') {
        assert.equal(config.inspect('libraryDirectory')?.defaultValue, undefined);
        console.log('[schema recovery] reproducing registration failure');
        await assert.rejects(config.update('libraryDirectory', directory, vscode.ConfigurationTarget.Global), /没有注册配置|未注册配置|not a registered configuration/i);
        checks.push('reproduced real unregistered configuration write failure');
      } else assert.equal(config.inspect('libraryDirectory').defaultValue, '');
      await config.update('bingEnabled', false, vscode.ConfigurationTarget.Workspace);
      await config.update('hoverFallback', 'ecdict', vscode.ConfigurationTarget.Workspace);
      console.log('[schema recovery] activating product');
      const api = await extension.activate();
      console.log('[schema recovery] product activated');
      if (recovery === 'missing') {
        // Installed products and the test driver have separate VS Code API
        // objects. Replace the product's picker, never invoke a native dialog.
        const productApi = require('node:module').createRequire(path.join(extension.extensionPath, 'out/extension.js'))('vscode');
        const openDialog = productApi.window.showOpenDialog;
        productApi.window.showOpenDialog = async () => [vscode.Uri.file(directory)];
        try {
          console.log('[schema recovery] choosing directory');
          await vscode.commands.executeCommand('daiguaTranslate.choosePacks');
          console.log('[schema recovery] directory chosen');
        }
        finally { productApi.window.showOpenDialog = openDialog; }
        console.log('[schema recovery] saved inspection=' + JSON.stringify(vscode.workspace.getConfiguration('daiguaTranslate').inspect('libraryDirectory')));
        assert.equal(config.get('libraryDirectory', ''), '', 'native setting must remain unavailable');
        checks.push('directory picker saved to extension persistence without registered setting');
      } else {
        console.log('[schema recovery] restored inspection=' + JSON.stringify(vscode.workspace.getConfiguration('daiguaTranslate').inspect('libraryDirectory')));
        const stored = vscode.workspace.getConfiguration('daiguaTranslate').inspect('libraryDirectory').globalValue;
        assert.equal(path.win32.normalize(stored).toLowerCase(), path.win32.normalize(directory).toLowerCase());
        checks.push('new process restored persisted selection and migrated to registered user setting');
      }
      const document = await vscode.workspace.openTextDocument({language:'c',content:'EK'});
      await vscode.window.showTextDocument(document);
      assert.match(await hoverAt(document,new vscode.Position(0,1)),/熠日照明/);
      await vscode.commands.executeCommand('daiguaTranslate.openDetails','EK');
      assert.equal(api.panels.result.components[0].meanings[0],'熠日照明');
      checks.push('recovered directory serves real hover and reader queries');
      api.panels.dispose();
      await sendReport({passed:true,vscode:vscode.version,recovery,checks});
      return;
    }
    const groups = extension.packageJSON.contributes.configuration;
    for (const group of Array.isArray(groups) ? groups : [groups]) {
      for (const [key, property] of Object.entries(group.properties)) {
        const inspected = vscode.workspace.getConfiguration().inspect(key);
        assert.ok(inspected, `Configuration was not registered: ${key}`);
        assert.deepEqual(inspected.defaultValue, property.default, `Missing registered default: ${key}`);
      }
    }
    checks.push(`all configuration keys registered from extension manifest ${extension.packageJSON.version}`);
    await config.update('technicalLibraryPaths', require('../../tests/fixtures/library-paths.cjs'), vscode.ConfigurationTarget.Workspace);
    await config.update('bingEnabled', false, vscode.ConfigurationTarget.Workspace);
    await config.update('hoverFallback', 'ecdict', vscode.ConfigurationTarget.Workspace);
    await config.update('packPaths', [path.join(repository, 'knowledge-packs/enhanced/05_createtask-pack.phonetic.json')], vscode.ConfigurationTarget.Workspace);
    const api = await extension.activate();
    assert.equal(api.extendTranslate, undefined);
    await vscode.commands.executeCommand('daiguaTranslate.reloadPacks');
    checks.push('independent activation without MTranCode');

    let document = await vscode.workspace.openTextDocument({ language: 'c', content: 'worker\nLED\narg\nMotor_Start\nuint16_t' });
    let editor = await vscode.window.showTextDocument(document);
    let result = await hoverAt(document, new vscode.Position(0, 2));
    assert.match(result, /动态工作任务/); assert.match(result, /音标：/);
    result = await hoverAt(document, new vscode.Position(2, 1));
    assert.match(result, /任务运行周期/); assert.match(result, /拼字母/);
    checks.push('real C hover and indexed parameter pronunciation');

    result = await hoverAt(document, new vscode.Position(1, 1));
    assert.match(result, /发光二极管/); assert.match(result, /词语释义/);
    assert.doesNotMatch(result, /待人工复核/);
    result = await hoverAt(document, new vscode.Position(4, 2));
    assert.match(result, /16 位无符号整数类型/);
    assert.doesNotMatch(result, /\nt：|待人工复核|待确认/);
    assert.doesNotMatch(result, /AI-type-convention|英式优先/);
    const otherProvider = vscode.languages.registerHoverProvider('c', { provideHover() {
      return new vscode.Hover(new vscode.MarkdownString().appendCodeblock('typedef unsigned short uint16_t', 'c'));
    } });
    try {
      const combined = await hoverAt(document, new vscode.Position(4, 2));
      assert.match(combined, /typedef unsigned short uint16_t/);
      assert.match(combined, /16 位无符号整数类型/);
    } finally { otherProvider.dispose(); }
    await config.update('debugMode', true, vscode.ConfigurationTarget.Workspace);
    result = await hoverAt(document, new vscode.Position(4, 2));
    assert.match(result, /AI-type-convention/);
    await config.update('debugMode', false, vscode.ConfigurationTarget.Workspace);
    const board = await vscode.workspace.openTextDocument({language:'c',content:'course_board_init\napp_board_init'});
    await vscode.window.showTextDocument(board);
    result = await hoverAt(board,new vscode.Position(0,4));
    assert.match(result,/板级初始化/);assert.doesNotMatch(result,/288|MHz|course_board\.c/);
    result = await hoverAt(board,new vscode.Position(1,4));
    assert.match(result,/名称推测/);
    await vscode.commands.executeCommand('daiguaTranslate.openDetails','course_board_init');
    assert.equal(api.panels.result.kind,'project');
    await vscode.commands.executeCommand('daiguaTranslate.openSettings');
    api.panels.dispose();
    await vscode.window.showTextDocument(document);
    editor = vscode.window.activeTextEditor;
    checks.push('concise results, debug provenance, inferred general names, reader and settings webviews');
    await config.update('hoverFallback', 'off', vscode.ConfigurationTarget.Workspace);
    result = await hoverAt(document, new vscode.Position(1, 1));
    assert.doesNotMatch(result, /发光二极管/);
    checks.push('real dictionary/off hover modes');

    const generalFile = path.join(repository, 'knowledge-packs/dfu-20261110/general-terms.json');
    const generalTerms = require('../out/offline-dictionary').validateTerms(
      JSON.parse(require('node:fs').readFileSync(generalFile, 'utf8').replace(/^\uFEFF/, '')));
    assert.equal(generalTerms.length, 17);
    await config.update('technicalLibraryPaths', [generalFile], vscode.ConfigurationTarget.Workspace);
    await config.update('hoverFallback', 'ecdict', vscode.ConfigurationTarget.Workspace);
    const generalDocument = await vscode.workspace.openTextDocument({ language: 'c', content: 'parse_frame\nDFU' });
    result = await hoverAt(generalDocument, new vscode.Position(0, 3));
    assert.match(result, /解析帧/);
    result = await hoverAt(generalDocument, new vscode.Position(1, 1));
    assert.match(result, /设备固件升级/);
    await config.update('technicalLibraryPaths', [], vscode.ConfigurationTarget.Workspace);
    await config.update('hoverFallback', 'off', vscode.ConfigurationTarget.Workspace);
    checks.push('DFU general library: real file validation, configuration and offline hover');

    const fs = require('node:fs');
    const workspace = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const directory = path.join(workspace, 'library');
    fs.cpSync(path.join(repository, 'dictionaries'), directory, { recursive: true });
    const catalog = JSON.parse(fs.readFileSync(path.join(directory, 'library.json'), 'utf8'));
    for (const p of catalog.projects) p.source_roots = [];
    const currentRoot = path.join(workspace, 'current');
    require('../../tests/fixtures/cross-project.cjs')(catalog, directory, currentRoot);
    fs.writeFileSync(path.join(directory, 'library.json'), JSON.stringify(catalog));
    await config.update('libraryDirectory', directory, vscode.ConfigurationTarget.Workspace);
    await vscode.commands.executeCommand('daiguaTranslate.reloadPacks');
    fs.mkdirSync(currentRoot);
    const symbols = ['cross_function','cross_variable','cross_macro','cross_enum','cross_typedef','shared_arg'];
    const probeFile = path.join(currentRoot, 'probe.c');
    fs.writeFileSync(probeFile, symbols.join('\n'));
    const probe = await vscode.workspace.openTextDocument(probeFile);
    await vscode.window.showTextDocument(probe);
    for (const [line, symbol] of symbols.entries()) {
      const markdown = await hoverAt(probe, new vscode.Position(line, 3));
      assert.match(markdown, /本工程解释/); assert.match(markdown, /其他工程参考/);
      assert.doesNotMatch(markdown, /参考四|private\/probe\.c/);
      await vscode.commands.executeCommand('daiguaTranslate.openDetails', symbol);
      const r = api.panels.result;
      assert.equal(r.candidates.length, 4, symbol);
      assert.equal(r.candidates[0].relation, 'current');
      assert.equal(r.candidates[0].origins.length, 2);
      assert.deepEqual(r.candidates.slice(1).map(c=>c.relation), ['reference','reference','reference']);
      api.panels.dispose();
      await vscode.window.showTextDocument(probe);
    }
    result = await hoverAt(probe, new vscode.Position(0, 3));
    assert.ok(result.indexOf('本工程解释') < result.indexOf('参考一'));
    const unbound = await vscode.workspace.openTextDocument({language:'c',content:'cross_function'});
    await vscode.window.showTextDocument(unbound);
    await vscode.commands.executeCommand('daiguaTranslate.openDetails', 'cross_function');
    assert.equal(api.panels.result.candidates.length, 3);
    assert.ok(api.panels.result.candidates.every(c=>c.relation === 'reference'));
    api.panels.dispose();
    checks.push('directory-only loading, current project recognition, all source kinds and parameters, merged provenance, three references and unbound fallback');
    const delayedFile = 'words/new-subdirectory/deferred.json';
    catalog.word_libraries.push(delayedFile);
    fs.writeFileSync(path.join(directory, 'library.json'), JSON.stringify(catalog));
    await vscode.commands.executeCommand('daiguaTranslate.reloadPacks');
    await config.update('hoverFallback', 'ecdict', vscode.ConfigurationTarget.Workspace);
    const delayedDocument = await vscode.workspace.openTextDocument({language:'c',content:'DYNTERM'});
    await vscode.window.showTextDocument(delayedDocument);
    fs.mkdirSync(path.dirname(path.join(directory, delayedFile)), {recursive:true});
    fs.writeFileSync(path.join(directory, delayedFile), JSON.stringify({format_version:1,entries:[{
      token:'DYNTERM',match:'insensitive',translation:'新目录词条已加载',reading:'unknown',source:'host-fixture',review_status:'unreviewed',
    }]}));
    const untilHover = async expected => {
      const deadline = Date.now() + 8000;
      do {
        const text = await hoverAt(delayedDocument, new vscode.Position(0,2));
        if (text.includes('新目录词条已加载') === expected) return;
        await new Promise(resolve=>setTimeout(resolve,150));
      } while(Date.now()<deadline);
      throw Error('Directory watcher did not refresh deferred term: ' + expected);
    };
    await untilHover(true);
    catalog.word_libraries.pop();
    fs.writeFileSync(path.join(directory, 'library.json'), JSON.stringify(catalog));
    await untilHover(false);
    await config.update('hoverFallback', 'off', vscode.ConfigurationTarget.Workspace);
    checks.push('real filesystem events discover a term in a newly created subdirectory and stop using it after catalog removal');
    // The watcher scenario is complete; cancel its pending debounce before testing
    // unrelated explicit commands so a late reload cannot invalidate them.
    await config.update('autoReload', false, vscode.ConfigurationTarget.Workspace);
    await vscode.commands.executeCommand('daiguaTranslate.reloadPacks');
    await vscode.window.showTextDocument(document);
    editor = vscode.window.activeTextEditor;
    editor.selection = new vscode.Selection(0, 1, 0, 1);
    // Let the selection event settle before starting an explicit request.
    await new Promise(resolve => setTimeout(resolve, 100));
    await vscode.commands.executeCommand('daiguaTranslate.translateSelection');
    result = await hoverAt(document, editor.selection.active);
    assert.match(result, /worker/);
    assert.equal((result.match(/动态工作任务/g) || []).length, 1);
    checks.push('explicit command shares one real hover result');

    document = await vscode.workspace.openTextDocument({ language: 'plaintext', content: '// first line\nsecond line' });
    editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(0, 0, 1, 6);
    await new Promise(resolve => setTimeout(resolve, 100));
    await vscode.commands.executeCommand('daiguaTranslate.translateSelection');
    result = await hoverAt(document, editor.selection.active);
    assert.match(result, /无法提供整句译文/);
    assert.equal(document.getText(), '// first line\nsecond line');
    checks.push('multiline explicit command in plaintext leaves original unchanged');
    await sendReport({ passed: true, vscode: vscode.version, checks });
  } catch (error) {
    await sendReport({ passed: false, vscode: vscode.version, checks, error: String(error), stack: error.stack });
    throw error;
  }
};
