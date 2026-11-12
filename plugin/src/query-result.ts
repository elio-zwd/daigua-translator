import { KnowledgePackEntry, Pronunciation } from './types';
import { formatEntries } from './symbol-matcher';
import { formatPronunciation } from './pronunciation';

export interface Meaning {
  text: string;
  meanings: string[];
  pronunciation?: Pronunciation;
  source: string;
}
export interface ResultCandidate {
  relation?: 'current' | 'reference';
  origins?: KnowledgePackEntry[];
  name: string;
  summary?: string;
  owner?: string;
  pronunciation?: Pronunciation;
  entry?: KnowledgePackEntry;
  source?: string;
}
export interface QueryResult {
  text: string;
  kind: 'project' | 'general' | 'dictionary' | 'online' | 'error';
  match: 'exact' | 'inferred' | 'components' | 'none';
  matchedName?: string;
  candidates: ResultCandidate[];
  components?: Meaning[];
  diagnostics: string[];
  message?: string;
}
export function projectResult(text: string, entries: KnowledgePackEntry[], currentProject?: string, diagnostics: string[] = []): QueryResult {
  const normalize = (s?: string) => (s || '').trim().replace(/\s+/g, ' ');
  const current = (e: KnowledgePackEntry) => !!currentProject && e.origin?.projectId === currentProject;
  const ordered = [...entries.filter(current), ...entries.filter(e => !current(e))];
  const groups = new Map<string, ResultCandidate>();
  for (const entry of ordered) {
    const key = JSON.stringify([entry.symbol, entry.kind, entry.owner || '', normalize(entry.name_zh), normalize(entry.summary_zh)]);
    const old = groups.get(key);
    if (old) { old.origins!.push(entry); continue; }
    groups.set(key, { name: entry.name_zh, summary: entry.summary_zh, owner: entry.owner,
      pronunciation: entry.pronunciation, entry, origins: [entry], relation: current(entry) ? 'current' : 'reference' });
  }
  let references = 0;
  const candidates = [...groups.values()].filter(c => c.relation === 'current' || references++ < 3);
  return { text, kind: 'project', match: 'exact', diagnostics, candidates };
}
export function resultLabel(result: QueryResult): string {
  return result.kind === 'project' ? '源码释义' : result.kind === 'general'
    ? `命名约定${result.match === 'inferred' ? ' · 名称推测' : ''}`
    : result.kind === 'online' ? '联网翻译' : result.kind === 'error' ? '查询提示' : '词语释义';
}
export function errorResult(text: string, error: unknown): QueryResult {
  const detail = error instanceof Error ? error.message : String(error);
  const message = /最多 1000/.test(detail) ? '单次最多 1000 字符，请缩小选区。'
    : /联网翻译已关闭/.test(detail) ? '联网翻译已关闭，无法提供整句译文。'
    : '暂时无法查询，请在设置中检查词库或联网状态。';
  return { text, kind: 'error', match: 'none', candidates: [], diagnostics: [detail], message };
}
/** Compatibility output retains provenance for existing programmatic callers. */
export function legacyResult(result: QueryResult): string {
  if (result.kind === 'project') return '呆瓜 · 本地知识包\n' + formatEntries(result.candidates.map(c => c.entry!));
  const lines = [result.kind === 'online' ? '呆瓜 · Bing 联网翻译 · 普通名称释义，用途未核对'
    : '普通名称释义，用途未核对（离线词典）'];
  for (const c of result.candidates) {
    lines.push(`${result.text}：${c.name}${c.summary ? '。' + c.summary : ''}${c.source ? ` [技术库：${c.source}]` : ''}`);
    lines.push(formatPronunciation(c.pronunciation));
  }
  for (const c of result.components || []) {
    lines.push(`${c.text}：${c.meanings.join('\n')} [${c.source}]`);
    lines.push(formatPronunciation(c.pronunciation));
  }
  return [...result.diagnostics, ...lines].join('\n');
}
