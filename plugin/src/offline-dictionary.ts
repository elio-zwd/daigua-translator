import * as fs from 'fs';
import * as path from 'path';
import { splitIdentifier, isNamingPrefix } from './identifier-words';
import { PronunciationSegment } from './types';
import { formatPronunciation } from './pronunciation';

export interface TechnicalTerm {
  token: string;
  match: 'exact' | 'insensitive' | 'prefix';
  symbol?: string;
  expansion?: string;
  translation: string;
  reading: PronunciationSegment['reading'];
  phonetic?: string;
  source: string;
  review_status: 'unreviewed' | 'confirmed';
}
interface DictionaryWord { word: string; translation: string; phonetic: string; }
interface Manifest { format_version: number; source_sha256: string; shards: Record<string, string>; }
export interface OfflineSettings { dictionaryPath: string; technicalLibraryPaths: string[]; }

export function validateTerms(value: unknown): TechnicalTerm[] {
  const data = value as { format_version?: number; entries?: TechnicalTerm[] };
  if (!data || data.format_version !== 1 || !Array.isArray(data.entries)) throw Error('技术库格式不兼容');
  for (const t of data.entries) {
    if (!t || typeof t.token !== 'string' || !/^[A-Za-z]+$/.test(t.token) ||
        !['exact', 'insensitive', 'prefix'].includes(t.match) ||
        !['word', 'letters', 'silent', 'unknown'].includes(t.reading) ||
        typeof t.translation !== 'string' || typeof t.source !== 'string' || !t.source.trim() ||
        !['unreviewed', 'confirmed'].includes(t.review_status) ||
        (t.symbol !== undefined && (typeof t.symbol !== 'string' || !/^[A-Za-z_]\w*$/.test(t.symbol))) ||
        (t.expansion !== undefined && typeof t.expansion !== 'string') ||
        (t.phonetic !== undefined && typeof t.phonetic !== 'string') ||
        (['word', 'letters'].includes(t.reading) && !t.phonetic?.trim())) throw Error('无效技术库词条');
  }
  return data.entries;
}

/** No native dependencies. Immutable shards are read lazily, with at most eight cached. */
export class OfflineDictionary {
  private key = '';
  private manifest?: Promise<Manifest>;
  private shards = new Map<string, Promise<Record<string, DictionaryWord[]>>>();
  private terms?: Promise<TechnicalTerm[][]>;
  private diagnostics = new Set<string>();
  private generation = 0;
  constructor(private readonly getSettings: () => OfflineSettings,
    private readonly warn: (message: string) => void = () => {}) {}

  reset(): void { ++this.generation; this.key = ''; this.manifest = undefined; this.terms = undefined; this.shards.clear(); this.diagnostics.clear(); }
  private report(message: string) { if (!this.diagnostics.has(message)) { this.diagnostics.add(message); this.warn(message); } }
  private configure(): OfflineSettings {
    const settings = this.getSettings();
    const key = JSON.stringify(settings);
    if (key !== this.key) { this.reset(); this.key = key; }
    return settings;
  }
  private async libraries(paths: string[]): Promise<TechnicalTerm[][]> {
    if (!this.terms) this.terms = (async () => {
      const result: TechnicalTerm[][] = [];
      const files = [path.join(__dirname, '../resources/technical-terms.json'), ...paths];
      for (const file of files) {
        try { result.push(validateTerms(JSON.parse((await fs.promises.readFile(file, 'utf8')).replace(/^\uFEFF/, '')))); }
        catch (error) { this.report(`技术库 ${file}：${String(error)}`); }
      }
      return result.reverse(); // Last user file overrides bundled terms, without merging different meanings.
    })();
    return this.terms;
  }
  private async words(token: string, directory: string, generation: number): Promise<{ rows: DictionaryWord[]; source: string }> {
    if (!directory.trim()) throw Error('ECDICT 索引尚未配置，请设置 dictionaryPath');
    if (!this.manifest) this.manifest = fs.promises.readFile(path.join(directory, 'manifest.json'), 'utf8').then(text => {
      const m = JSON.parse(text.replace(/^\uFEFF/, ''));
      if (m.format_version !== 1 || !/^[a-f0-9]{64}$/i.test(m.source_sha256) ||
          !m.shards || typeof m.shards !== 'object' || Array.isArray(m.shards)) throw Error('ECDICT 索引格式不兼容');
      return m as Manifest;
    });
    const manifest = await this.manifest;
    if (generation !== this.generation) throw Error('词典配置已变化，请重新查询');
    const key = token.toLowerCase().slice(0, 2);
    const file = manifest.shards[key];
    if (!file) return { rows: [], source: `ECDICT:${manifest.source_sha256.slice(0, 12)}` };
    if (typeof file !== 'string' || !/^[a-z]{1,2}\.json$/.test(file)) throw Error('ECDICT 分片路径无效');
    let shard = this.shards.get(key);
    if (shard) this.shards.delete(key);
    else shard = fs.promises.readFile(path.join(directory, file), 'utf8').then(text => {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('ECDICT 分片必须是对象');
      return parsed;
    });
    this.shards.set(key, shard!);
    if (this.shards.size > 8) this.shards.delete(this.shards.keys().next().value!);
    const rows = (await shard!)[token.toLowerCase()] ?? [];
    if (!Array.isArray(rows) || rows.some(r => !r || typeof r.word !== 'string' ||
        typeof r.translation !== 'string' || typeof r.phonetic !== 'string')) throw Error('ECDICT 词条损坏');
    return { rows, source: `ECDICT:${manifest.source_sha256.slice(0, 12)}` };
  }

  async explain(symbol: string): Promise<string> {
    const settings = this.configure();
    const generation = this.generation;
    const libraries = await this.libraries(settings.technicalLibraryPaths);
    if (generation !== this.generation) throw Error('词典配置已变化，请重新查询');
    const parts = splitIdentifier(symbol);
    const lines = ['普通名称释义，用途未核对（离线词典）'];
    let cursor = 0;
    for (const [index, token] of parts.entries()) {
      const start = symbol.indexOf(token, cursor);
      cursor = start + token.length;
      const numericAdjacent = /[0-9]/.test(symbol[start - 1] || '') || /[0-9]/.test(symbol[cursor] || '');
      if (/^\d+$/.test(token)) { lines.push(`${token}：数字，未标注读音`); continue; }
      let matches: TechnicalTerm[] = [];
      for (const library of libraries) {
        matches = library.filter(t => (!t.symbol || t.symbol === symbol) &&
          (t.match === 'insensitive' ? t.token.toLowerCase() === token.toLowerCase() : t.token === token) &&
          (t.match !== 'prefix' || isNamingPrefix(symbol, token, index)));
        if (matches.some(t => t.symbol === symbol)) matches = matches.filter(t => t.symbol === symbol);
        if (matches.length) break;
      }
      if (matches.length) {
        for (const term of matches) {
          lines.push(`${token}：${term.translation || '含义待确认'}${term.expansion ? `（${term.expansion}）` : ''} [技术库：${term.source}；${term.review_status === 'confirmed' ? '已复核读法' : '待人工复核'}]`);
          lines.push(formatPronunciation({ segments: [{ text: token, reading: term.reading, phonetic: term.phonetic,
            source: term.source, status: term.reading === 'unknown' ? 'pending' : 'resolved', review_status: term.review_status }] }));
        }
        continue;
      }
      try {
        const { rows, source } = await this.words(token, settings.dictionaryPath, generation);
        if (generation !== this.generation) throw Error('词典配置已变化，请重新查询');
        if (!rows.length) lines.push(`${token}：未找到词典释义`);
        for (const row of rows) {
          lines.push(`${token}：${row.translation.replace(/\\n/g, '\n') || '中文释义缺失'} [${source}]`);
          // Single letters and all-uppercase unknowns may be units/models/acronyms.
          if (row.phonetic && !numericAdjacent && token.length > 1 && row.word === token.toLowerCase()) {
            lines.push(formatPronunciation({ segments: [{ text: token, reading: 'word', phonetic: row.phonetic, source, status: 'resolved' }] }));
          }
        }
        if (numericAdjacent) lines.push(`${token}：与数字相邻，可能是型号或宽度标记，读法待确认`);
      } catch (error) {
        if (generation !== this.generation) throw error;
        const message = String(error); this.report(message); lines.push(`${token}：${message}`);
      }
    }
    const notices = [...this.diagnostics];
    if (notices.length) lines.push('词典诊断：' + notices.join('；'));
    return lines.join('\n');
  }
}
