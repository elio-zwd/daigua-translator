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
    await config.update('bingEnabled', false, vscode.ConfigurationTarget.Workspace);
    await config.update('hoverFallback', 'ecdict', vscode.ConfigurationTarget.Workspace);
    await config.update('packPaths', [path.join(repository, 'knowledge-packs/enhanced/05_createtask-pack.phonetic.json')], vscode.ConfigurationTarget.Workspace);
    const extension = vscode.extensions.getExtension('elio-zwd.daigua-translator');
    assert.ok(extension);
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
    assert.match(result, /发光二极管/); assert.match(result, /词典释义/);
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
