import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { QueryResult } from './query-result';
import { escapeHtml as e, resultHtml } from './result-renderer';

export interface SettingsModel {
  libraryCounts?: { words: number; naming: number; symbols: number };
  libraryErrors?: number;
  values: Record<string, unknown>;
  scope: string;
  packs: { path: string; status: string }[];
  count: number;
  aiHandoff?: string;
}
const css = `
:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font:var(--vscode-font-size)/1.7 var(--vscode-font-family)}
.library-directory code{overflow-wrap:anywhere;font-size:12px}.library-directory{padding:16px 0}
nav{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:8px;padding:12px 20px;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border)}
main{max-width:900px;margin:0 auto;padding:24px clamp(16px,5vw,44px) 48px}h1{font-size:clamp(22px,3vw,30px);line-height:1.4;margin:6px 0 16px;overflow-wrap:anywhere}.word{font-family:var(--vscode-editor-font-family)}
h2{font-size:21px;line-height:1.5;margin:0 0 10px;font-weight:650}h3{font-size:16px;margin:0 0 8px}.eyebrow{font-size:12px;letter-spacing:.08em;color:var(--vscode-descriptionForeground);margin:0}
.tag{display:inline-block;font-size:12px;border:1px solid var(--vscode-panel-border);border-radius:5px;padding:2px 9px;color:var(--vscode-descriptionForeground)}
article{margin:24px 0;padding:22px 0;border-top:1px solid var(--vscode-panel-border)}.summary{font-size:16px;line-height:1.9;margin:8px 0 18px;white-space:pre-wrap;overflow-wrap:anywhere}
.phonetic,.muted,.help{color:var(--vscode-descriptionForeground);font-size:13px;overflow-wrap:anywhere}.phonetic span{margin-right:8px}.note{border-left:3px solid var(--vscode-textLink-foreground);padding:8px 14px;white-space:pre-wrap}
button,select,input{font:inherit;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:4px;padding:6px 10px;max-width:100%}
button{cursor:pointer;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}button:hover{background:var(--vscode-button-secondaryHoverBackground)}button.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible,a:focus-visible,pre:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:3px}button[aria-pressed=true]{border-color:var(--vscode-focusBorder)}
button:disabled{opacity:.6;cursor:default}.ai-handoff{margin:20px 0;padding:16px;border:1px solid var(--vscode-panel-border);border-radius:6px}.ai-handoff pre{max-height:320px;overflow-y:auto;margin-bottom:0}
section{margin:28px 0;border-top:1px solid var(--vscode-panel-border);padding-top:24px}.row{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:18px 0}.row>div{flex:1}.row p{margin:3px 0}.row label{font-weight:600}input[type=checkbox]{width:19px;height:19px;accent-color:var(--vscode-focusBorder)}
select{min-width:170px}input[type=number]{width:110px}.path{padding:12px 0;border-bottom:1px solid var(--vscode-panel-border);display:flex;gap:12px;align-items:center}.path>div{flex:1;min-width:0}.path code{font-family:var(--vscode-editor-font-family);font-size:12px;overflow-wrap:anywhere;display:block}.path p{margin:0}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
details{margin:16px 0}summary{cursor:pointer;color:var(--vscode-textLink-foreground)}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.7 var(--vscode-editor-font-family);padding:14px;background:var(--vscode-textCodeBlock-background)}.debug{border-top:1px solid var(--vscode-panel-border);padding-top:18px}
@media(max-width:440px){.row{align-items:flex-start;flex-wrap:wrap;gap:8px}.row>div{flex-basis:80%}.row select{width:100%}nav{padding:10px 12px;gap:6px}nav button{font-size:12px}h2{font-size:19px}}
`;
function documentHtml(content: string, toolbar: string): string {
  const nonce = randomBytes(18).toString('base64');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <style nonce="${nonce}">${css}</style></head><body><nav>${toolbar}</nav><main id="content">${content}</main>
    <script nonce="${nonce}">
    const api=acquireVsCodeApi();
    document.addEventListener('click',event=>{const b=event.target.closest('button[data-action]');if(b)api.postMessage({action:b.dataset.action,key:b.dataset.key,index:Number(b.dataset.index)});});
    document.addEventListener('change',event=>{const t=event.target;if(t.dataset.key)api.postMessage({action:'set',key:t.dataset.key,value:t.type==='checkbox'?t.checked:t.type==='number'?Number(t.value):t.value});});
    window.addEventListener('message',event=>{const m=event.data;if(m.type==='render'){const y=window.scrollY;document.getElementById('content').innerHTML=m.html;if(m.toolbar!==undefined)document.querySelector('nav').innerHTML=m.toolbar;window.scrollTo(0,y);}if(m.type==='notice'){const target=document.getElementById(m.target);if(target)target.textContent=m.text;}});
    </script></body></html>`;
}
const button = (label: string, action: string, attrs = '') => `<button data-action="${action}" ${attrs}>${label}</button>`;
export function settingsHtml(model: SettingsModel, notices: Record<string, string> = {}): string {
  const v = model.values;
  const notice = (id: string) => `<p id="${id}" role="status" class="help">${e(notices[id] || '')}</p>`;
  const toggle = (key: string, label: string, help: string) => `<div class="row"><div><label for="${key}">${label}</label><p class="help">${help}</p></div><input id="${key}" data-key="${key}" type="checkbox" ${v[key] ? 'checked' : ''}></div>`;
  const list = (key: string, title: string) => {
    const paths = key === 'dictionaryPath' ? (v[key] ? [v[key] as string] : []) : v[key] as string[];
    return `<h3>${title}</h3>${paths.length ? paths.map((p, index) => `<div class="path"><div><code>${e(p)}</code>${key === 'packPaths' ? `<p class="help">${e(model.packs.find(x => x.path === p)?.status || '等待加载')}</p>` : ''}</div>${button('移除', 'remove', `data-key="${key}" data-index="${index}"`)}</div>`).join('') : '<p class="help">尚未配置</p>'}
      <div class="actions">${button(key === 'dictionaryPath' ? '选择词典目录' : '添加文件', 'choose', `data-key="${key}"`)}</div>${notice(key + 'Notice')}`;
  };
  return `<header><p class="eyebrow">呆瓜 · 设置</p><h1>让查词顺手一点</h1><p class="muted">修改后自动保存到${e(model.scope)}，立即生效。</p>${notice('notice')}</header>
    <section><h2>日常使用</h2>${toggle('localHover', '悬停查词', '在 C/C++ 名称上显示释义；主动查询始终可用。')}
    <div class="row"><div><label for="hoverFallback">未收录名称</label><p class="help">先查命名约定和词语释义，再按所选方式回退；关闭时只查源码符号。</p></div><select id="hoverFallback" data-key="hoverFallback">${[['online','自动查词，允许联网回退'],['ecdict','仅查本地词库'],['off','不自动解释']].map(([key,label]) => `<option value="${key}" ${v.hoverFallback === key ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
    ${toggle('bingEnabled','允许联网翻译','关闭后名称只查本地，普通句子无法联网翻译。')}${toggle('showStatusBar','显示状态栏入口','点击状态栏的“呆瓜”打开此设置页。')}
    <p class="help">音标以英式读音为主；词典没有完整区分口音，不能保证每条都是英式。没有可靠读音时显示“音标暂缺”。</p></section>
    <section><h2>词库管理</h2><p class="help">插件不内置词库。选择独立目录后，只加载 library.json 清单启用的文件。</p>
    <div class="library-directory"><h3>词库目录</h3>${v.libraryDirectory ? `<code>${e(String(v.libraryDirectory))}</code>` : '<p class="help">尚未选择词库目录。</p>'}
    <p id="libraryCounts">词语释义库：${model.libraryCounts?.words || 0} 条 · 命名约定库：${model.libraryCounts?.naming || 0} 条 · 源码符号库：${model.libraryCounts?.symbols || model.count} 条</p>
    ${model.libraryErrors ? `<p class="help">${model.libraryErrors} 个文件加载失败，查看加载诊断了解详情。</p>` : ''}
    <p class="help">源码目录自动识别本工程；其他工程最多显示 3 条不同释义。词库目录默认保存到用户设置，可跨工程共用。</p>
    <div class="actions">${button('选择词库目录','choose','data-key="libraryDirectory" class="primary"')}${v.libraryDirectory ? button('移除目录','remove','data-key="libraryDirectory"') : ''}${button('重新加载','reload')}${button('查看加载诊断','diagnostics')}</div>${notice('libraryDirectoryNotice')}</div>
    <div class="ai-handoff"><h3>让外部 AI 完善词库</h3><p class="help">复制后填写工程路径，连同工程代码和已有词库发给外部 AI，维护词语释义、命名约定和源码符号三类数据。完整内容包含任务模板、目录清单、校验与加载说明。</p>
    <div class="actions">${button('复制完整提示词','copyAiHandoff', `class="primary" ${model.aiHandoff ? '' : 'disabled'}`)}</div>
    ${notice('aiHandoffNotice')}
    ${model.aiHandoff ? `<details><summary>查看完整提示词</summary><pre tabindex="0" aria-label="外部 AI 完整提示词">${e(model.aiHandoff)}</pre></details>` : '<p class="help">提示词未能加载，请重新安装插件后重试。</p>'}</div>
    ${!v.libraryDirectory ? `<details class="legacy-libraries"><summary>旧版文件配置（迁移兼容）</summary><p class="help">选择词库目录后仅使用清单，不再叠加这些旧配置。</p>${list('packPaths','源码符号文件')}<br>${list('technicalLibraryPaths','旧版混合词库文件')}<br>${list('dictionaryPath','ECDICT 索引')}</details>` : ''}
    ${toggle('autoReload','保存词库后自动更新','清单和启用文件保存后自动更新，失败时保留上次可用内容。')}${toggle('includeParameters','查询函数参数','将源码符号库中的参数说明加入查词，同名候选保留所属函数。')}</section>
    <section><h2>调试与诊断</h2>${toggle('debugMode','显示调试信息','在结果末尾显示原始详细说明、来源编号、文件位置与匹配依据。日常可保持关闭。')}
    <div class="row"><div><label for="bingTimeoutMs">联网等待上限（毫秒）</label><p class="help">超时后名称改查本地词典。</p></div><input id="bingTimeoutMs" data-key="bingTimeoutMs" type="number" min="100" max="30000" value="${Number(v.bingTimeoutMs)}"></div>
    <div class="actions">${button('查看加载诊断','diagnostics')}${button('打开原生设置','nativeSettings')}</div></section>`;
}

/** Owns at most one reader and one settings tab. No queries originate in a webview. */
export class ReaderPanels implements vscode.Disposable {
  private reader?: vscode.WebviewPanel;
  private settings?: vscode.WebviewPanel;
  private notices: Record<string, string> = {};
  result?: QueryResult;
  locked = false;
  constructor(private readonly debug: () => boolean, private readonly model: () => SettingsModel,
    private readonly action: (message: Record<string, unknown>) => Promise<string | void>,
    private readonly follow: () => void) {}
  get follows(): boolean { return !!this.reader?.visible && !this.locked; }
  get isOpen(): boolean { return !!this.reader; }
  private toolbar(): string {
    return button(this.locked ? '已锁定 · 解锁' : '跟随光标 · 锁定', 'lock', `aria-pressed="${this.locked}"`)
      + button('复制名称','copy') + button('设置','settings');
  }
  showReader(result?: QueryResult): void {
    if (result) this.result = result;
    if (!this.reader) {
      this.reader = vscode.window.createWebviewPanel('daigua.reader', '呆瓜 · 查词', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true, localResourceRoots: [] });
      this.reader.webview.html = documentHtml(this.readerContent(), this.toolbar());
      this.reader.onDidDispose(() => { this.reader = undefined; this.locked = false; this.follow(); });
      this.reader.onDidChangeViewState(() => this.follow());
      this.reader.webview.onDidReceiveMessage(message => this.handle(message));
    } else { this.reader.reveal(undefined, true); this.refreshReader(); }
  }
  private readerContent(): string { return this.result ? resultHtml(this.result, this.debug()) : '<p class="eyebrow">呆瓜 · 查词</p><h1>读懂一个名称</h1><p class="muted">将光标移到 C/C++ 名称上，或使用右键翻译选区。</p>'; }
  setResult(result?: QueryResult): void { this.result = result; this.refreshReader(); }
  private refreshReader(): void { void this.reader?.webview.postMessage({ type: 'render', html: this.readerContent(), toolbar: this.toolbar() }); }
  refresh(): void {
    this.refreshReader();
    void this.settings?.webview.postMessage({ type: 'render', html: settingsHtml(this.model(), this.notices) });
  }
  showSettings(): void {
    if (this.settings) { this.settings.reveal(); this.refresh(); return; }
    this.settings = vscode.window.createWebviewPanel('daigua.settings', '呆瓜 · 设置', vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [] });
    this.settings.webview.html = documentHtml(settingsHtml(this.model(), this.notices), button('原生设置','nativeSettings'));
    this.settings.onDidDispose(() => { this.settings = undefined; });
    this.settings.webview.onDidReceiveMessage(message => this.handle(message));
  }
  private async handle(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object' || typeof (message as Record<string, unknown>).action !== 'string') return;
    const m = message as Record<string, unknown>;
    const target = m.action === 'copyAiHandoff' ? 'aiHandoffNotice'
      : ['choose', 'remove'].includes(m.action as string) && ['libraryDirectory', 'packPaths', 'technicalLibraryPaths', 'dictionaryPath'].includes(m.key as string)
        ? m.key + 'Notice' : 'notice';
    const notify = (text: string) => {
      this.notices[target] = text;
      void this.settings?.webview.postMessage({ type: 'notice', target, text });
    };
    try {
      if (m.action === 'lock') { this.locked = !this.locked; this.refreshReader(); this.follow(); }
      else if (m.action === 'copy') { if (this.result) await vscode.env.clipboard.writeText(this.result.text); }
      else if (m.action === 'copyAiHandoff') {
        const prompt = this.model().aiHandoff;
        if (!prompt) throw Error('提示词未能加载，请重新安装插件后重试。');
        await vscode.env.clipboard.writeText(prompt);
        notify('已复制完整提示词。填写工程路径后，连同工程代码和已有词库发给外部 AI。');
      }
      else if (m.action === 'settings') this.showSettings();
      else {
        if (m.action === 'choose') notify('正在选择文件或目录…');
        const result = await this.action(m);
        if (result) notify(result);
      }
    } catch (error) {
      // Errors are text, never HTML or commands from webview-supplied data.
      notify('操作未完成：' + String(error));
    }
  }
  dispose(): void { this.reader?.dispose(); this.settings?.dispose(); }
}
