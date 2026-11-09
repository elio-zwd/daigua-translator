import { QueryResult, resultLabel } from './query-result';
import { Pronunciation } from './types';

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const escapeMarkdown = (s: string) => escapeHtml(s).replace(/[\\`*_{}\[\]()#+.!|>~-]/g, '\\$&').replace(/\r?\n/g, '  \n');

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
export function debugText(r: QueryResult): string {
  return JSON.stringify({ 类型: r.kind, 匹配: r.match, 匹配名称: r.matchedName,
    词条: r.candidates, 拆词: r.components, 诊断: r.diagnostics }, null, 2);
}
export function hoverMarkdown(r: QueryResult, debug = false): string {
  const e = escapeMarkdown;
  const lines = [`### ${e(r.text)}`, ''];
  if (r.message) lines.push(e(r.message), '');
  r.candidates.forEach((c, i) => {
    if (i) lines.push('---', '');
    if (r.candidates.length > 1) lines.push(`候选 ${i + 1} / ${r.candidates.length}`, '');
    lines.push(`**${e(c.name)}**`, '');
    if (c.summary) lines.push(e(c.summary), '');
    if (c.owner) lines.push(`所属函数：${e(c.owner)}`, '');
    lines.push(e(pronunciationLine(c.pronunciation)), '');
  });
  for (const c of r.components || []) lines.push(`**${e(c.text)}**　${e(c.meanings[0] || '释义暂缺')}`, '', e(pronunciationLine(c.pronunciation)), '');
  lines.push(e(resultLabel(r)), '');
  if (debug) lines.push('---', '', '**调试信息**', '', '```json', debugText(r).replace(/`/g, '\\u0060'), '```', '');
  // Command arguments are encoded from data; only these app-owned links are trusted.
  const args = encodeURIComponent(JSON.stringify([r.text]));
  lines.push(`[在面板中查看](command:daiguaTranslate.openDetails?${args}) · [设置](command:daiguaTranslate.openSettings)`);
  return lines.join('\n');
}
export function resultHtml(r: QueryResult, debug = false): string {
  const e = escapeHtml;
  const candidates = r.candidates.map((c, i) => `<article>${r.candidates.length > 1 ? `<p class="eyebrow">候选 ${i + 1} / ${r.candidates.length}</p>` : ''}<h2>${e(c.name)}</h2>${c.summary ? `<p class="summary">${e(c.summary)}</p>` : ''}
    ${c.owner ? `<p class="muted">所属函数：${e(c.owner)}</p>` : ''}<p class="phonetic">${e(pronunciationLine(c.pronunciation))}</p>
    </article>`).join('');
  const components = (r.components || []).map(c => `<article><h2 class="component">${e(c.text)}</h2><p class="summary">${e(c.meanings[0] || '释义暂缺')}</p>
    <p class="phonetic">${e(pronunciationLine(c.pronunciation))}</p>${c.meanings.length > 1
      ? `<details><summary>其余 ${c.meanings.length - 1} 条词义</summary>${c.meanings.slice(1).map(m => `<p>${e(m)}</p>`).join('')}</details>` : ''}</article>`).join('');
  return `<header><p class="eyebrow">呆瓜 · 查词</p><h1 class="word">${e(r.text)}</h1><span class="tag">${e(resultLabel(r))}</span></header>
    ${r.message ? `<p class="note">${e(r.message)}</p>` : ''}${candidates}${components}
    ${debug ? `<details class="debug" open><summary>调试信息</summary><pre>${e(debugText(r))}</pre></details>` : ''}`;
}
