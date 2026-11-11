/** Windows 10 x64 / Node 22+. No mouse, keyboard injection or external dependencies. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');

const pause = ms => new Promise(r => setTimeout(r, ms));
async function until(action, label, timeout = 30000) {
  const end = Date.now() + timeout;
  let error;
  do {
    try { const result = await action(); if (result) return result; } catch (e) { error = e; }
    await pause(150);
  } while (Date.now() < end);
  throw Error(`Timed out: ${label}${error ? ': ' + error.message : ''}`);
}
const unusedPort = () => new Promise((resolve, reject) => {
  const server = net.createServer(); server.on('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
async function cdpConnect(url) {
  const socket = new WebSocket(url);
  let next = 0;
  const pending = new Map(), contexts = new Map();
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.id) {
      const item = pending.get(m.id); if (!item) return;
      pending.delete(m.id); clearTimeout(item.timer);
      m.error ? item.reject(Error(m.error.message)) : item.resolve(m.result);
    } else if (m.method === 'Runtime.executionContextCreated') {
      const c = m.params.context;
      contexts.set(`${m.sessionId || ''}:${c.id}`, { session: m.sessionId, id: c.id });
    } else if (m.method === 'Runtime.executionContextsCleared') {
      for (const [key, c] of contexts) if (c.session === m.sessionId) contexts.delete(key);
    } else if (m.method === 'Runtime.executionContextDestroyed') contexts.delete(`${m.sessionId || ''}:${m.params.executionContextId}`);
  });
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 8000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const attached = new Set();
  async function refreshContexts() {
    await call('Runtime.enable');
    const { targetInfos } = await call('Target.getTargets');
    for (const t of targetInfos.filter(t => t.type === 'iframe' && !attached.has(t.targetId))) {
      try {
        const { sessionId } = await call('Target.attachToTarget', { targetId: t.targetId, flatten: true });
        attached.add(t.targetId); await call('Runtime.enable', {}, sessionId);
      } catch { /* A webview may be destroyed while the tab is replaced. */ }
    }
  }
  const evaluate = async (c, expression) => {
    const r = await call('Runtime.evaluate', { expression, contextId: c.id, returnByValue: true, awaitPromise: true }, c.session);
    if (r.exceptionDetails) throw Error(r.exceptionDetails.text);
    return r.result.value;
  };
  const frame = async kind => {
    await refreshContexts();
    for (const c of [...contexts.values()].reverse()) {
      try {
        if (await evaluate(c, `!!document.querySelector(${JSON.stringify(kind === 'settings' ? '#debugMode' : '.tag')})`)) return c;
      } catch { /* Stale context from a closed/reloaded webview. */ }
    }
  };
  return { call, frame, evaluate, close: () => socket.close() };
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daigua-ui-'));
  const workspace = path.join(directory, 'workspace');
  fs.mkdirSync(path.join(workspace, '.vscode'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.vscode/settings.json'), JSON.stringify({
    'update.mode': 'none', 'extensions.autoUpdate': false, 'telemetry.telemetryLevel': 'off',
    'workbench.startupEditor': 'none', 'chat.disableAIFeatures': true, 'workbench.colorTheme': 'Default Dark Modern',
  }));
  const profileSettings = path.join(directory, 'profile', 'User');
  fs.mkdirSync(profileSettings, { recursive: true });
  fs.writeFileSync(path.join(profileSettings, 'settings.json'), JSON.stringify({
    'update.mode': 'none', 'extensions.autoUpdate': false, 'telemetry.telemetryLevel': 'off', 'chat.disableAIFeatures': true,
  }));
  const code = process.env.DAIGUA_CODE_EXE || path.resolve(path.dirname(execFileSync('where.exe', ['code.cmd'], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/)[0]), '../Code.exe');
  const debugPort = await unusedPort(), uiPort = await unusedPort();
  const log = fs.openSync(path.join(directory, 'host.log'), 'w');
  const child = spawn(code, ['--new-window', '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
    '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${debugPort}`, '--user-data-dir', path.join(directory, 'profile'),
    '--extensions-dir', path.join(directory, 'extensions'), `--extensionDevelopmentPath=${path.join(root, 'plugin')}`,
    `--extensionTestsPath=${path.join(root, 'plugin/host-tests/ui.cjs')}`, workspace], {
    env: { ...process.env, DAIGUA_UI_PORT: String(uiPort) }, windowsHide: true, stdio: ['ignore', log, log],
  });
  child.on('error', e => { console.error(e); });
  const bridge = async route => {
    const response = await fetch(`http://127.0.0.1:${uiPort}${route}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw Error(await response.text()); return response.json();
  };
  let cdp;
  const checks = [];
  try {
    const state = await until(() => bridge('/state'), 'isolated host startup', 60000);
    const target = await until(async () => (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t => t.type === 'page' && t.url.includes('workbench')), 'Chromium target');
    cdp = await cdpConnect(target.webSocketDebuggerUrl);
    const reader = () => until(() => cdp.frame('reader'), 'reader DOM');
    const screenshot = async name => {
      const r = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(directory, name + '.png'), Buffer.from(r.data, 'base64'));
    };
    for (const [name, theme, cls] of [['dark', 'Default Dark Modern', 'vscode-dark'], ['light', 'Default Light Modern', 'vscode-light'], ['contrast', 'Default High Contrast', 'vscode-high-contrast']]) {
      await bridge('/theme?name=' + encodeURIComponent(theme));
      await until(async () => cdp.evaluate(await reader(), `document.body.classList.contains(${JSON.stringify(cls)})`), `${name} theme`);
      const data = await cdp.evaluate(await reader(), `({text:document.querySelector('main').innerText,overflow:document.documentElement.scrollWidth>innerWidth,background:getComputedStyle(document.body).backgroundColor})`);
      assert.match(data.text, /板级初始化/); assert.doesNotMatch(data.text, /288|MHz|AI-initial|course_board\.c/); assert.equal(data.overflow, false);
      await screenshot('reader-' + name); checks.push(`${name} theme, concise content and no horizontal overflow`);
    }
    await bridge('/theme?name=Default%20Dark%20Modern');
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 850, height: 900, deviceScaleFactor: 1, mobile: false });
    await bridge('/layout?ratio=.5');
    await bridge('/reader?word=very_long_project_prefix_with_many_words_board_init');
    await until(async () => cdp.evaluate(await reader(), `document.querySelector('h1').textContent.startsWith('very_long_')`), 'long word render');
    assert.equal(await cdp.evaluate(await reader(), 'document.documentElement.scrollWidth>innerWidth'), false);
    await until(async () => cdp.evaluate(await reader(), 'innerWidth<=440'), 'narrow reader viewport');
    await screenshot('reader-narrow'); checks.push('narrow panel and wrapping long identifier');
    await cdp.evaluate(await reader(), `document.querySelector('[data-action=lock]').click()`);
    await bridge('/select?line=2'); await pause(500);
    assert.equal((await bridge('/state')).result, 'very_long_project_prefix_with_many_words_board_init');
    await cdp.evaluate(await reader(), `document.querySelector('[data-action=lock]').click()`);
    await until(async () => (await bridge('/state')).result === 'uint16_t', 'unlock and cursor follow');
    checks.push('real webview lock/unlock messages and cursor-follow behavior');
    await cdp.call('Emulation.clearDeviceMetricsOverride');
    await bridge('/layout?ratio=.5');
    await bridge('/settings');
    const settings = await until(() => cdp.frame('settings'), 'settings DOM');
    const headings = await cdp.evaluate(settings, `[...document.querySelectorAll('section h2')].map(e=>e.textContent)`);
    assert.deepEqual(headings, ['日常使用', '词库管理', '调试与诊断']);
    const libraryButton = `document.querySelector('[data-action=choose][data-key=technicalLibraryPaths]')`;
    const libraryNotice = `document.querySelector('#technicalLibraryPathsNotice')`;
    await bridge('/picker?mode=valid');
    await cdp.evaluate(settings, `${libraryButton}.scrollIntoView({block:'center'});${libraryButton}.click()`);
    await until(async () => cdp.evaluate(settings, `${libraryNotice}.textContent.includes('17 条词条')`), 'general library addition feedback');
    assert.deepEqual((await bridge('/state')).technicalLibraryPaths.map(p=>p.toLowerCase()), [path.join(root, 'knowledge-packs/dfu-20261110/general-terms.json').toLowerCase()]);
    assert.equal(await cdp.evaluate(settings, `${libraryNotice}.getBoundingClientRect().top<innerHeight && ${libraryNotice}.getBoundingClientRect().bottom>0`), true);
    await screenshot('settings-library-added');
    await cdp.evaluate(settings, `${libraryButton}.click()`);
    await until(async () => cdp.evaluate(settings, `${libraryNotice}.textContent.includes('已在列表中')`), 'duplicate library feedback');
    await bridge('/picker?mode=invalid');
    await cdp.evaluate(settings, `${libraryButton}.click()`);
    await until(async () => cdp.evaluate(settings, `${libraryNotice}.textContent.includes('当前配置未修改')`), 'invalid library feedback');
    assert.equal((await bridge('/state')).technicalLibraryPaths.length, 1);
    await screenshot('settings-library-error');
    await bridge('/picker?mode=cancel');
    await cdp.evaluate(settings, `${libraryButton}.click()`);
    await until(async () => cdp.evaluate(settings, `${libraryNotice}.textContent.includes('已取消')`), 'cancel library feedback');
    await cdp.evaluate(settings, `document.querySelector('[data-action=remove][data-key=technicalLibraryPaths]').click()`);
    await until(async () => (await bridge('/state')).technicalLibraryPaths.length === 0, 'remove general library');
    checks.push('general library button: DFU file selection, 17 entries, visible persistent feedback, duplicate, invalid file, cancel and removal');
    const prompt = fs.readFileSync(path.join(root, 'docs/external-ai-handoff.md'), 'utf8');
    await cdp.evaluate(settings, `document.querySelector('[data-action=copyAiHandoff]').scrollIntoView({block:'center'})`);
    await cdp.evaluate(settings, `document.querySelector('[data-action=copyAiHandoff]').click()`);
    await until(async () => cdp.evaluate(settings, `document.querySelector('#aiHandoffNotice').textContent.includes('已复制完整提示词')`), 'prompt copy confirmation');
    assert.equal((await bridge('/clipboard')).clipboard, prompt);
    await cdp.evaluate(settings, `document.querySelector('.ai-handoff details').open=true`);
    assert.equal(await cdp.evaluate(settings, `document.querySelector('.ai-handoff pre').textContent`), prompt);
    for (const [name, theme, cls] of [['dark','Default Dark Modern','vscode-dark'], ['light','Default Light Modern','vscode-light'], ['contrast','Default High Contrast','vscode-high-contrast']]) {
      await bridge('/theme?name=' + encodeURIComponent(theme));
      await until(async () => cdp.evaluate(settings, `document.body.classList.contains(${JSON.stringify(cls)})`), 'settings ' + name);
      await cdp.evaluate(settings, `document.querySelector('.ai-handoff details').open=true`);
      assert.equal(await cdp.evaluate(settings, `document.querySelector('.ai-handoff pre').textContent`), prompt);
      assert.equal(await cdp.evaluate(settings, 'document.documentElement.scrollWidth>innerWidth'), false);
      await screenshot('settings-ai-' + name);
    }
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 850, height: 900, deviceScaleFactor: 1, mobile: false });
    await until(async () => cdp.evaluate(settings, 'innerWidth<=440'), 'narrow settings');
    await cdp.evaluate(settings, `document.querySelector('.ai-handoff details').open=true; document.querySelector('[data-action=copyAiHandoff]').scrollIntoView({block:'center'})`);
    assert.equal(await cdp.evaluate(settings, 'document.documentElement.scrollWidth>innerWidth'), false);
    await screenshot('settings-ai-narrow');
    await cdp.call('Emulation.clearDeviceMetricsOverride');
    await bridge('/theme?name=Default%20Dark%20Modern');
    checks.push('complete AI prompt preview and clipboard match maintained document; settings themes and narrow layout');
    await cdp.evaluate(settings, `(()=>{const t=document.querySelector('#debugMode');t.checked=true;t.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await until(async () => (await bridge('/state')).debug, 'settings persistence');
    await screenshot('settings');
    await cdp.evaluate(settings, `document.querySelector('#debugMode').scrollIntoView({block:'center'})`);
    await screenshot('settings-debug');
    await bridge('/reader?word=uint16_t');
    await until(async () => cdp.evaluate(await reader(), `document.querySelector('main').innerText.includes('AI-type-convention')`), 'debug provenance');
    checks.push('settings groups, DOM change event, persisted debug mode and provenance rendering');
    fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify({ passed: true, vscode: state.vscode, checks }, null, 2));
    console.log(JSON.stringify({ passed: true, directory, checks }, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify({ passed: false, checks, error: String(error) }, null, 2));
    throw Error(`${error.message}\nEvidence: ${directory}`);
  } finally {
    cdp?.close();
    await bridge('/finish').catch(() => {});
    // Only terminate the child process started by this isolated test, never a user window.
    if (child.exitCode === null) {
      await Promise.race([new Promise(r => child.once('exit', r)), pause(5000)]);
      if (child.exitCode === null) child.kill();
    }
    fs.closeSync(log);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
