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
  const textOf = hovers => hovers.flatMap(h => h.contents.map(c => typeof c === 'string' ? c : c.value)).join('\n');
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

    let document = await vscode.workspace.openTextDocument({ language: 'c', content: 'worker\nLED\narg\nMotor_Start' });
    let editor = await vscode.window.showTextDocument(document);
    let result = await hoverAt(document, new vscode.Position(0, 2));
    assert.match(result, /动态工作任务/); assert.match(result, /音标（英式优先）/);
    result = await hoverAt(document, new vscode.Position(2, 1));
    assert.match(result, /毫秒周期的指针/); assert.match(result, /拼字母/);
    checks.push('real C hover and indexed parameter pronunciation');

    result = await hoverAt(document, new vscode.Position(1, 1));
    assert.match(result, /发光二极管/); assert.match(result, /用途未核对/);
    await config.update('hoverFallback', 'off', vscode.ConfigurationTarget.Workspace);
    result = await hoverAt(document, new vscode.Position(1, 1));
    assert.doesNotMatch(result, /发光二极管/);
    checks.push('real dictionary/off hover modes');

    editor.selection = new vscode.Selection(0, 1, 0, 1);
    // Let the selection event settle before starting an explicit request.
    await new Promise(resolve => setTimeout(resolve, 100));
    await vscode.commands.executeCommand('daiguaTranslate.translateSelection');
    result = await hoverAt(document, editor.selection.active);
    assert.match(result, /原文：worker/);
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
