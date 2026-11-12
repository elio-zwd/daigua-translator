import * as fs from 'fs';
import * as path from 'path';
import { splitIdentifier, isNamingPrefix } from './identifier-words';
import { Pronunciation, PronunciationSegment } from './types';
import { QueryResult, Meaning, legacyResult } from './query-result';

export interface TechnicalTerm {
  token: string;
  match: 'exact' | 'insensitive' | 'prefix' | 'identifier';
  symbol?: string;
  expansion?: string;
  translation: string;
  summary_zh?: string;
  reading: PronunciationSegment['reading'];
  phonetic?: string;
  source: string;
  review_status: 'unreviewed' | 'confirmed';
}
interface DictionaryWord { word: string; translation: string; phonetic: string; }
interface Manifest { format_version: number; source_sha256: string; shards: Record<string, string>; }
export interface OfflineSettings { dictionaryPath: string; technicalLibraryPaths: string[]; termLibraries?: TechnicalTerm[][]; }

export function validateTerms(value: unknown): TechnicalTerm[] {
  const data = value as { format_version?: number; entries?: TechnicalTerm[] };
  if (!data || data.format_version !== 1 || !Array.isArray(data.entries)) throw Error('技术库格式不兼容');
  for (const t of data.entries) {
    if (!t || typeof t.token !== 'string' || !(t.match === 'identifier' ? /^[A-Za-z_]\w*$/ : /^[A-Za-z]+$/).test(t.token) ||
        !['exact', 'insensitive', 'prefix', 'identifier'].includes(t.match) ||
        !['word', 'letters', 'silent', 'unknown'].includes(t.reading) ||
        typeof t.translation !== 'string' || typeof t.source !== 'string' || !t.source.trim() ||
        !['unreviewed', 'confirmed'].includes(t.review_status) ||
        (t.symbol !== undefined && (typeof t.symbol !== 'string' || !/^[A-Za-z_]\w*$/.test(t.symbol))) ||
        (t.expansion !== undefined && typeof t.expansion !== 'string') ||
        (t.summary_zh !== undefined && typeof t.summary_zh !== 'string') ||
        (t.phonetic !== undefined && typeof t.phonetic !== 'string') ||
        (['word', 'letters'].includes(t.reading) && !t.phonetic?.trim())) throw Error('无效技术库词条');
  }
  return data.entries;
}

/** Complete-name conventions must not leak into fragments or unrelated single-letter names. */
function findTerms(libraries: TechnicalTerm[][], symbol: string, token: string, index: number, whole = false): TechnicalTerm[] {
  for (const library of libraries) {
    let matches = library.filter(t => (t.match === 'identifier') === whole && (!t.symbol || t.symbol === symbol) &&
      (t.match === 'insensitive' ? t.token.toLowerCase() === token.toLowerCase() : t.token === token) &&
      (t.match !== 'prefix' || isNamingPrefix(symbol, token, index)));
    if (matches.some(t => t.symbol === symbol)) matches = matches.filter(t => t.symbol === symbol);
    if (matches.length) return matches;
  }
  return [];
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
      const result: TechnicalTerm[][] = [...(this.getSettings().termLibraries || [])];
      const files = paths;
      for (const file of files) {
        try { result.push(validateTerms(JSON.parse((await fs.promises.readFile(file, 'utf8')).replace(/^\uFEFF/, '')))); }
        catch (error) { this.report(`技术库 ${file}：${String(error)}`); }
      }
      return result.reverse(); // Last explicitly enabled file wins, without merging different meanings.
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

  private termPronunciation(term: TechnicalTerm, text: string): Pronunciation {
    return { segments: [{ text, reading: term.reading, phonetic: term.phonetic, source: term.source,
      status: term.reading === 'unknown' ? 'pending' : 'resolved', review_status: term.review_status }] };
  }

  /** Only entries with an authored summary opt into cross-project normalization/inference. */
  async generalResult(symbol: string): Promise<QueryResult | undefined> {
    const settings = this.configure(), generation = this.generation;
    const libraries = await this.libraries(settings.technicalLibraryPaths);
    if (generation !== this.generation) throw Error('词典配置已变化，请重新查询');
    let matches = findTerms(libraries, symbol, symbol, 0, true);
    let inferred = false;
    const normalize = (s: string) => splitIdentifier(s).map(t => t.toLowerCase()).join('_');
    const words = splitIdentifier(symbol);
    if (!matches.length) {
      const normalized = normalize(symbol);
      // Prefer an exact normalized name across all libraries before considering any suffix.
      for (let removed = 0; removed <= words.length - 2 && !matches.length; removed++) {
        const suffix = normalize(words.slice(removed).join('_'));
        for (const library of libraries) {
          matches = library.filter(t => t.match === 'identifier' && !t.symbol && !!t.summary_zh?.trim() &&
            !/\d/.test(t.token) && normalize(t.token) === (removed ? suffix : normalized));
          if (matches.length) { inferred = removed > 0; break; }
        }
      }
    }
    if (!matches.length) return;
    const pronunciation = inferred || matches[0].token !== symbol || !!matches[0].summary_zh
      ? await this.pronunciationFor(symbol, settings, libraries, generation) : undefined;
    return { text: symbol, kind: 'general', match: inferred ? 'inferred' : 'exact', matchedName: matches[0].token,
      candidates: matches.map(t => ({ name: t.translation, summary: t.summary_zh, source: t.source,
        pronunciation: pronunciation || this.termPronunciation(t, symbol) })), diagnostics: [...this.diagnostics] };
  }

  private async pronunciationFor(symbol: string, settings: OfflineSettings, libraries: TechnicalTerm[][],
    generation: number): Promise<Pronunciation> {
    const segments: PronunciationSegment[] = [];
    let cursor = 0;
    for (const [index, token] of splitIdentifier(symbol).entries()) {
      const start = symbol.indexOf(token, cursor); cursor = start + token.length;
      const term = findTerms(libraries, symbol, token, index)[0];
      if (term) { segments.push(...this.termPronunciation(term, token).segments); continue; }
      let phonetic: string | undefined, source = 'unavailable';
      if (!/[0-9]/.test(symbol[start - 1] || '') && !/[0-9]/.test(symbol[cursor] || '') && token.length > 1) {
        try {
          const found = await this.words(token, settings.dictionaryPath, generation);
          source = found.source;
          phonetic = found.rows.find(r => r.word === token.toLowerCase() && r.phonetic)?.phonetic;
        } catch (error) {
          if (generation !== this.generation) throw error;
          this.report(String(error));
        }
      }
      segments.push({ text: token, reading: phonetic ? 'word' : 'unknown', phonetic,
        source, status: phonetic ? 'resolved' : 'pending' });
    }
    if (generation !== this.generation) throw Error('词典配置已变化，请重新查询');
    return { segments };
  }

  async explainResult(symbol: string): Promise<QueryResult> {
    const general = await this.generalResult(symbol);
    if (general) return general;
    const settings = this.configure(), generation = this.generation;
    const libraries = await this.libraries(settings.technicalLibraryPaths);
    const components: Meaning[] = [];
    let cursor = 0;
    for (const [index, token] of splitIdentifier(symbol).entries()) {
      const start = symbol.indexOf(token, cursor); cursor = start + token.length;
      const numericAdjacent = /[0-9]/.test(symbol[start - 1] || '') || /[0-9]/.test(symbol[cursor] || '');
      if (/^\d+$/.test(token)) {
        components.push({ text: token, meanings: ['数字，未标注读音'], source: 'identifier' }); continue;
      }
      const matches = findTerms(libraries, symbol, token, index);
      if (matches.length) {
        components.push({ text: token, meanings: matches.map(t => t.translation || '释义暂缺'),
          source: matches.map(t => t.source).join('；'), pronunciation: this.termPronunciation(matches[0], token) });
        continue;
      }
      try {
        const { rows, source } = await this.words(token, settings.dictionaryPath, generation);
        if (generation !== this.generation) throw Error('词典配置已变化，请重新查询');
        const meanings = [...new Set(rows.flatMap(r => r.translation.replace(/\\n/g, '\n').split(/\r?\n/)).map(s => s.trim()).filter(Boolean))];
        const row = rows.find(r => r.phonetic && token.length > 1 && r.word === token.toLowerCase());
        components.push({ text: token, meanings: meanings.length ? meanings : ['未找到词典释义'], source,
          pronunciation: !numericAdjacent && row ? { segments: [{ text: token, reading: 'word',
            phonetic: row.phonetic, source, status: 'resolved' }] } : undefined });
        if (numericAdjacent) components[components.length - 1].pronunciation = { segments: [{ text: token,
          reading: 'unknown', source, status: 'pending' }] };
      } catch (error) {
        if (generation !== this.generation) throw error;
        this.report(String(error));
        components.push({ text: token, meanings: ['暂时无法查询词典释义'], source: 'unavailable' });
      }
    }
    if (generation !== this.generation) throw Error('词典配置已变化，请重新查询');
    return { text: symbol, kind: 'dictionary', match: 'components', candidates: [], components,
      diagnostics: [...this.diagnostics] };
  }

  async hasLocalTerms(symbol: string): Promise<boolean> {
    const settings = this.configure();
    const libraries = await this.libraries(settings.technicalLibraryPaths);
    return splitIdentifier(symbol).some((token, index) => findTerms(libraries, symbol, token, index).length > 0);
  }

  async explain(symbol: string): Promise<string> { return legacyResult(await this.explainResult(symbol)); }
}
