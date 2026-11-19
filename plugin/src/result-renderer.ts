import { QueryResult, resultLabel } from './query-result';
import { Pronunciation } from './types';
import { PanelLearning, LearningItem, LearningBranch, LearningMeaning } from './panel-learning';

export interface HoverLocation {
  uri: string;
  version: number;
  line: number;
  character: number;
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
// VS Code's hover renderer preserves HTML entities as text. Escape Markdown
// directly so apostrophes stay readable and HTML/entity input stays literal.
export const escapeMarkdown = (s: string) => s.replace(/[\\`*_{}\[\]()#+.!|<>~&-]/g, '\\$&').replace(/\r?\n/g, '  \n');

export function pronunciationText(p?: Pronunciation): string {
  if (!p?.segments.length) return '音标暂缺';
  const known = p.segments.filter(s => s.reading === 'silent' || s.status === 'resolved' && !!s.phonetic);
  if (!known.length) return '音标暂缺';
  const text = known.map(s => s.reading === 'silent' ? `${s.text}（不发音）`
    : `${s.text} ${s.reading === 'letters' ? '拼字母 ' : ''}/${s.phonetic}/`);
  if (known.length < p.segments.length) text.push('部分音标暂缺');
  return text.join(' · ');
}
const pronunciationLine = (p?: Pronunciation) => {
  const reading = pronunciationText(p);
  return reading === '音标暂缺' ? reading : '音标：' + reading;
};
export function debugText(r: QueryResult, includeNameDetails = false): string {
  return JSON.stringify({ 类型: r.kind, 匹配: r.match, 匹配名称: r.matchedName,
    词条: r.candidates, 联网翻译: r.onlineTranslation, 拆词: r.components, ...(includeNameDetails ? { 名称补充: r.nameDetails } : {}), 诊断: r.diagnostics }, null, 2);
}
export function hoverMarkdown(r: QueryResult, debug = false, location?: HoverLocation): string {
  const e = escapeMarkdown;
  const lines = [`### ${e(r.text)}`, ''];
  if (r.message) lines.push(e(r.message), '');
  if (r.onlineTranslation) lines.push(`**联网翻译**：${e(r.onlineTranslation)}`, '');
  r.candidates.forEach((c, i) => {
    if (i) lines.push('---', '');
    if (r.candidates.length > 1) lines.push(`候选 ${i + 1} / ${r.candidates.length}`, '');
    lines.push(`**${e(c.name)}**`, '');
    if (c.relation) lines.push(c.relation === 'current' ? '本工程' : '其他工程参考', '');
    if (c.summary) lines.push(e(c.summary), '');
    if (c.owner) lines.push(`所属函数：${e(c.owner)}`, '');
    lines.push(e(pronunciationLine(c.pronunciation)), '');
  });
  for (const c of r.components || []) lines.push(`**${e(c.text)}**　${e(c.meanings[0] || '释义暂缺')}`, '', e(pronunciationLine(c.pronunciation)), '');
  lines.push(e(resultLabel(r)), '');
  if (debug) lines.push('---', '', '**调试信息**', '', '```json', debugText(r).replace(/`/g, '\\u0060'), '```', '');
  // Command arguments are encoded from data; only these app-owned links are trusted.
  const args = encodeURIComponent(JSON.stringify(location ? [r.text, location] : [r.text]))
    .replace(/\(/g, '%28').replace(/\)/g, '%29');
  lines.push(`[在面板中查看](command:daiguaTranslate.openDetails?${args}) · [设置](command:daiguaTranslate.openSettings)`);
  return lines.join('\n');
}
export function resultHtml(r: QueryResult, debug = false): string {
  const e = escapeHtml;
  const candidates = r.candidates.map((c, i) => `<article>${r.candidates.length > 1 ? `<p class="eyebrow">候选 ${i + 1} / ${r.candidates.length}</p>` : ''}<h2>${e(c.name)}</h2>${c.summary ? `<p class="summary">${e(c.summary)}</p>` : ''}
    ${c.relation ? `<p class="eyebrow">${c.relation === 'current' ? '本工程' : '其他工程参考'}</p>` : ''}
    ${c.owner ? `<p class="muted">所属函数：${e(c.owner)}</p>` : ''}<p class="phonetic">${e(pronunciationLine(c.pronunciation))}</p>
    </article>`).join('');
  const components = (r.components || []).map(c => `<article><h2 class="component">${e(c.text)}</h2><p class="summary">${e(c.meanings[0] || '释义暂缺')}</p>
    <p class="phonetic">${e(pronunciationLine(c.pronunciation))}</p>${c.meanings.length > 1
      ? `<details><summary>其余 ${c.meanings.length - 1} 条词义</summary>${c.meanings.slice(1).map(m => `<p>${e(m)}</p>`).join('')}</details>` : ''}</article>`).join('');
  const extra = r.nameDetails?.length ? `<section class="name-details"><h2>名称补充</h2>${r.nameDetails.map(d =>
    `<div class="name-detail"><p><strong>${e(d.text)}</strong> <span class="muted">${d.kind === 'prefix' ? '常见命名约定' : '缩写原词'}</span></p><p>${e(d.description)}</p>${d.kind === 'expansion' ? `<p class="phonetic">原词${e(pronunciationLine(d.pronunciation))}</p>` : ''}</div>`).join('')}</section>` : '';
  return `<header><p class="eyebrow">呆瓜 · 查词</p><h1 class="word">${e(r.text)}</h1><span class="tag">${e(resultLabel(r))}</span></header>
    ${r.message ? `<p class="note">${e(r.message)}</p>` : ''}${r.onlineTranslation ? `<section class="online-translation"><p class="eyebrow">联网翻译</p><h2>${e(r.onlineTranslation)}</h2></section>` : ''}${candidates}${components}${extra}
    ${debug ? `<details class="debug" open><summary>调试信息</summary><pre>${e(debugText(r, true))}</pre></details>` : ''}`;
}

/** Fixed reader only. The legacy renderer and hover Markdown remain independent. */
export function panelResultHtml(r: QueryResult, learning: PanelLearning | undefined, debug = false): string {
  if (!learning) return resultHtml(r, debug);
  const e = escapeHtml;
  const reading = (p?: Pronunciation, numeric = false) => {
    const s = p?.segments[0];
    return numeric || s?.status === 'skipped' ? '未标注读音' : s?.status === 'resolved'
      ? s.reading === 'silent' ? '不发音' : s.phonetic ? `/${s.phonetic}/${s.reading === 'letters' ? ' · 拼字母' : ''}` : '音标暂缺' : '音标暂缺';
  };
  const meanings = (values: LearningMeaning[], title = '') => {
    if (!values.length) return '';
    const list = (rows: LearningMeaning[]) => `<ul class="learning-meanings">${rows.map(m =>
      `<li><span>${e(m.text)}</span>${m.basis === 'inferred' ? ' <span class="tag inference">名称推测</span>' : ''}</li>`).join('')}</ul>`;
    return `${title ? `<p class="learning-caption">${e(title)}</p>` : ''}${list(values.slice(0,1))}${values.length > 1 ? `<p class="learning-caption">其余词义</p>${list(values.slice(1))}` : ''}`;
  };
  const expansion = (b: LearningBranch) => {
    const x = b.expansion;
    if (!x) return '';
    const known = x.words.filter(w => w.pronunciation?.segments.some(s => s.status === 'resolved' && !!s.phonetic)).length;
    const status = known === x.words.length && known ? '' : known ? ' · 部分音标暂缺' : ' · 原词音标暂缺';
    return `<div class="expansion"><p class="expansion-name">${e(x.text)}${x.inferred ? ' <span class="tag inference">名称推测</span>' : ''}</p>
      <p class="learning-caption">原词释义与读音${status}</p>${x.words.map(w => item(w, true)).join('')}</div>`;
  };
  const item = (w: LearningItem, original = false): string => `<div class="${original ? 'original-word' : 'learning-item'}" data-key="${e(w.id)}" data-token="${e(w.text)}">
    <div class="learning-token">${e(w.text)}</div><div class="learning-content">${w.prefix ? '<p class="learning-caption">常见命名约定</p>' : ''}${meanings(w.meanings)}
    ${w.branches.length <= 1 ? `${w.branches.length ? meanings(w.branches[0].meanings, w.branches[0].applicable === false ? '名称推测 · 可能含义' : '') : ''}<p class="phonetic">${e(reading(w.pronunciation, w.numeric))}</p>${w.branches.map(b => `${b.context ? `<p class="learning-caption">${e(b.context)}</p>` : ''}${expansion(b)}`).join('')}`
      : `<p class="phonetic">${e(reading(w.pronunciation))}</p><p class="learning-caption">${w.branches.some(b => b.meanings.some(m => m.basis === 'inferred')) ? '名称推测 · 可能含义' : '不同含义'}</p>${w.branches.map((b, i) => `<div class="learning-branch"><p class="learning-caption">${b.meanings.some(m => m.basis === 'inferred') ? '可能含义' : '含义'} ${i + 1}</p>${meanings(b.meanings)}<p class="phonetic">${e(reading(b.pronunciation))}</p>${b.context ? `<p class="learning-caption">${e(b.context)}</p>` : ''}${expansion(b)}</div>`).join('')}`}
    ${meanings(w.dictionaryMeanings, '其他词典含义')}</div></div>`;
  const candidates = r.candidates.filter(c => !(r.kind === 'dictionary' && learning.items.length === 1 && !c.entry));
  return `<div class="reader-layout"><header data-key="heading"><h1 class="word">${e(r.text).replace(/_/g, '_<wbr>')}</h1>${!candidates.length ? `<span class="tag">${e(resultLabel(r))}</span>` : ''}</header>
    <div data-key="candidates">${r.message ? `<p class="note">${e(r.message)}</p>` : ''}${r.onlineTranslation ? `<article class="online-translation" data-key="online"><p class="eyebrow">联网翻译</p><h2>${e(r.onlineTranslation)}</h2></article>` : ''}
    ${candidates.map((c,i) => `<article data-key="candidate-${i}">${candidates.length > 1 ? `<p class="eyebrow">候选 ${i + 1} / ${candidates.length}</p>` : ''}<p class="candidate-tags"><span class="tag">${e(resultLabel(r))}</span>${c.relation ? ` <span class="tag">${c.relation === 'current' ? '本工程' : '其他工程参考'}</span>` : ''}</p><h2>${e(c.name)}</h2>${c.summary ? `<p class="summary">${e(c.summary)}</p>` : ''}${c.owner ? `<p class="muted">所属函数：${e(c.owner)}</p>` : ''}</article>`).join('')}
    ${!candidates.length && !r.onlineTranslation ? '<p class="muted">暂无完整名称释义，可查看逐词理解</p>' : ''}</div>
    <section class="learning" data-key="learning" data-state="${learning.state}" aria-label="逐词理解"><div class="learning-heading"><h2>逐词理解</h2><span class="muted">词义帮助理解名称</span></div>
    ${learning.state === 'loading' ? '<p role="status">正在整理逐词释义…</p>' : learning.state === 'unavailable' ? '<p role="status">逐词释义暂不可用</p>' : learning.items.map(w => item(w)).join('')}
    ${learning.diagnostics.includes('部分读音无法逐词对应') ? '<p class="muted">部分读音无法逐词对应</p>' : ''}</section>
    <p class="learning-footer" data-key="footer">${r.kind === 'project' ? '拆词含义用于辅助理解，具体用途见上方源码释义。' : '拆词含义用于辅助理解，不能据此确认代码实际用途。'}</p>
    <div data-key="debug">${debug ? `<details class="debug" open><summary>调试信息</summary><pre>${e(debugText(r, true))}\n${e(JSON.stringify(learning,null,2))}</pre></details>` : ''}</div></div>`;
}
