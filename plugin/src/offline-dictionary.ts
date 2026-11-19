import * as fs from 'fs';
import * as path from 'path';
import { splitIdentifier, isNamingPrefix } from './identifier-words';
import { Pronunciation, PronunciationSegment } from './types';
import { QueryResult, Meaning, NameDetail, legacyResult } from './query-result';
import { LearningItem, LearningMeaning, LearningBranch, PanelLearning } from './panel-learning';

export interface TechnicalTerm {
  token: string;
  match: 'exact' | 'insensitive' | 'prefix' | 'identifier';
  symbol?: string;
  expansion?: string;
  panel_only?: boolean;
  learning_only?: boolean;
  inference?: { aliases?: string[]; requires_tokens?: string[]; context_zh?: string };
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
        (t.panel_only !== undefined && (typeof t.panel_only !== 'boolean' || t.match !== 'prefix')) ||
        (t.learning_only !== undefined && (typeof t.learning_only !== 'boolean' || !['exact', 'insensitive'].includes(t.match))) ||
        (t.inference !== undefined && (!t.inference || typeof t.inference !== 'object' || Array.isArray(t.inference) ||
          !['exact', 'insensitive'].includes(t.match) || Object.keys(t.inference).some(k => !['aliases', 'requires_tokens', 'context_zh'].includes(k)) ||
          [t.inference.aliases, t.inference.requires_tokens].some(v => v !== undefined &&
            (!Array.isArray(v) || !v.length || v.some(s => typeof s !== 'string' || !/^[A-Za-z]+$/.test(s)))) ||
          (t.inference.context_zh !== undefined && (typeof t.inference.context_zh !== 'string' || !t.inference.context_zh.trim())))) ||
        (t.summary_zh !== undefined && typeof t.summary_zh !== 'string') ||
        (t.phonetic !== undefined && typeof t.phonetic !== 'string') ||
        (['word', 'letters'].includes(t.reading) && !t.phonetic?.trim())) throw Error('无效技术库词条');
  }
  return data.entries;
}

/** Complete-name conventions must not leak into fragments or unrelated single-letter names. */
function findTerms(libraries: TechnicalTerm[][], symbol: string, token: string, index: number, whole = false,
  prefixMatches = isNamingPrefix, includePanelOnly = false): TechnicalTerm[] {
  for (const library of libraries) {
    let matches = library.filter(t => !t.learning_only && (includePanelOnly || !t.panel_only) && (t.match === 'identifier') === whole && (!t.symbol || t.symbol === symbol) &&
      (t.match === 'insensitive' ? t.token.toLowerCase() === token.toLowerCase() : t.token === token) &&
      (t.match !== 'prefix' || prefixMatches(symbol, token, index)));
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
  private learningCache = new Map<string, Promise<PanelLearning>>();
  constructor(private readonly getSettings: () => OfflineSettings,
    private readonly warn: (message: string) => void = () => {}) {}

  reset(): void { ++this.generation; this.key = ''; this.manifest = undefined; this.terms = undefined; this.shards.clear(); this.diagnostics.clear(); this.learningCache.clear(); }
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

  /** Prefixes used for presentation only; lookup selection remains unchanged. */
  private displayPrefixes(symbol: string, libraries: TechnicalTerm[][]): Map<number, TechnicalTerm> {
    const tokens = splitIdentifier(symbol);
    const found = new Map<number, TechnicalTerm>();
    const prefixLibraries = libraries.map(library => library.filter(term => term.match === 'prefix'));
    const select = (token: string, index: number) =>
      findTerms(prefixLibraries, symbol, token, index, false, () => true, true)[0];
    const first = tokens[0];
    if (!first || !(isNamingPrefix(symbol, first, 0) ||
        symbol.startsWith(first) && /^_[A-Za-z]/.test(symbol.slice(first.length)))) return found;
    const firstTerm = select(first, 0);
    if (!firstTerm) return found;
    found.set(0, firstTerm);
    // Only explicit scope + pointer combinations are supported, e.g. g_pBuffer.
    const second = tokens[1];
    const marker = first + '_' + second;
    if (['g', 'm', 's'].includes(first) && second && ['p', 'px', 'pv', 'pc', 'puc'].includes(second) &&
        symbol.startsWith(marker) && /^(?:[A-Z]|_[A-Za-z])/.test(symbol.slice(marker.length))) {
      const secondTerm = select(second, 1);
      if (secondTerm) found.set(1, secondTerm);
    }
    return found;
  }

  /** Optional reader-only learning details; they never alter the lookup result. */
  async nameDetails(symbol: string): Promise<NameDetail[]> {
    const settings = this.configure(), generation = this.generation;
    const libraries = await this.libraries(settings.technicalLibraryPaths);
    const details: NameDetail[] = [];
    const tokens = splitIdentifier(symbol);
    const prefixes = this.displayPrefixes(symbol, libraries);
    for (const [index, token] of tokens.entries()) {
      // Select each category separately so a naming rule cannot hide a word entry.
      const words = libraries.map(l => l.filter(t => t.match === 'exact' || t.match === 'insensitive'));
      const term = findTerms(words, symbol, token, index)[0];
      if (term?.expansion?.trim()) {
        const segments: PronunciationSegment[] = [];
        for (const word of term.expansion.match(/[A-Za-z]+/g) || []) {
          let phonetic: string | undefined, source = 'unavailable';
          try {
            const found = await this.words(word, settings.dictionaryPath, generation);
            source = found.source;
            const readings = [...new Set(found.rows.filter(r => r.word === word.toLowerCase() && r.phonetic.trim()).map(r => r.phonetic))];
            if (readings.length === 1) phonetic = readings[0];
          } catch (error) {
            if (generation !== this.generation) throw error;
          }
          segments.push({ text: word, reading: phonetic ? 'word' : 'unknown', phonetic, source,
            status: phonetic ? 'resolved' : 'pending' });
        }
        details.push({ text: token, kind: 'expansion', description: term.expansion,
          pronunciation: { segments }, source: term.source });
      }
      const prefix = prefixes.get(index);
      if (prefix) details.push({ text: token, kind: 'prefix', description: prefix.summary_zh || prefix.translation, source: prefix.source });
    }
    if (generation !== this.generation) throw Error('词典配置已变化，请重新查询');
    return details;
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
          const readings = [...new Set(found.rows.filter(r => r.word === token.toLowerCase() && r.phonetic.trim()).map(r => r.phonetic))];
          if (readings.length === 1) phonetic = readings[0];
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

  async pronunciationForSymbol(symbol: string): Promise<Pronunciation> {
    const settings = this.configure(), generation = this.generation;
    const libraries = await this.libraries(settings.technicalLibraryPaths);
    return this.pronunciationFor(symbol, settings, libraries, generation);
  }

  /** Local learning enrichment, independent of complete-name matching and networking. */
  async panelLearning(result: QueryResult): Promise<PanelLearning> {
    this.configure();
    const key = JSON.stringify([this.generation, result.text, result.kind, result.candidates.map(c => c.pronunciation)]);
    let cached = this.learningCache.get(key);
    if (!cached) {
      cached = this.buildPanelLearning(result);
      this.learningCache.set(key, cached);
      if (this.learningCache.size > 64) this.learningCache.delete(this.learningCache.keys().next().value!);
      void cached.catch(() => { if (this.learningCache.get(key) === cached) this.learningCache.delete(key); });
    }
    return cached;
  }

  private async buildPanelLearning(result: QueryResult): Promise<PanelLearning> {
    const settings = this.configure(), generation = this.generation;
    const libraries = await this.libraries(settings.technicalLibraryPaths);
    const tokens = splitIdentifier(result.text), lower = tokens.map(t => t.toLowerCase());
    const prefixes = this.displayPrefixes(result.text, libraries);
    const diagnostics = new Set<string>();
    const dictionary = new Map<string, Promise<{ meanings: LearningMeaning[]; pronunciation?: Pronunciation }>>();
    const word = (token: string) => {
      const key = token.toLowerCase();
      if (!dictionary.has(key)) dictionary.set(key, (async () => {
        try {
          const { rows, source } = await this.words(token, settings.dictionaryPath, generation);
          const meanings = [...new Set(rows.flatMap(r => r.translation.replace(/\\n/g, '\n').split(/\r?\n/)).map(s => s.trim()).filter(Boolean))]
            .map(text => ({ text, basis: 'dictionary' as const, source }));
          const readings = [...new Set(rows.filter(r => r.word.toLowerCase() === key && r.phonetic.trim()).map(r => r.phonetic))];
          if (readings.length > 1) diagnostics.add(`${token}：词典读音冲突`);
          return { meanings, pronunciation: readings.length === 1 && token.length > 1 ? { segments: [{ text: token,
            reading: 'word' as const, phonetic: readings[0], source, status: 'resolved' as const }] } : undefined };
        } catch (error) {
          if (generation !== this.generation) throw Error('词典配置已变化，请重新查询');
          diagnostics.add(`${token}：${String(error)}`); return { meanings: [] };
        }
      })());
      return dictionary.get(key)!;
    };
    const meaning = (term: TechnicalTerm, inferred: boolean): LearningMeaning => ({ text: term.translation || '释义暂缺',
      basis: inferred ? 'inferred' : 'library', source: term.source, review_status: term.review_status, context: term.inference?.context_zh });
    const sourcePronunciations = tokens.map((_token, index) => {
      const authored = result.candidates.map(c => c.pronunciation).filter((p): p is Pronunciation => !!p);
      const aligned = authored.filter(p => p.segments.length === tokens.length && p.segments.every((s, i) => s.text === tokens[i]));
      if (authored.length !== aligned.length) diagnostics.add('部分读音无法逐词对应');
      const resolved = aligned.map(p => p.segments[index]).filter(s => s.status === 'resolved' && (s.reading === 'silent' || !!s.phonetic));
      const keys = new Set(resolved.map(s => JSON.stringify([s.reading, s.phonetic])));
      if (keys.size > 1) { diagnostics.add(`${index}:${tokens[index]}：源码读音冲突`); return { conflict: true }; }
      return { conflict: false, pronunciation: resolved.length ? { segments: [{ ...resolved[0] }] } : undefined };
    });
    const make = async (token: string, index: number, originalWord = false): Promise<LearningItem> => {
      const item: LearningItem = { id: `${originalWord ? 'original' : 'token'}-${index}`, text: token, meanings: [], branches: [], dictionaryMeanings: [] };
      if (/^\d+$/.test(token)) { item.numeric = true; item.meanings = [{text:'数字',basis:'library',source:'identifier'}]; return item; }
      const base = { ...await word(token) };
      const prefix = !originalWord ? prefixes.get(index) : undefined;
      const matches = prefix ? [prefix] : findTerms(libraries.map(l => l.filter(t => ['exact','insensitive'].includes(t.match))),
        originalWord ? token : result.text, token, index);
      // An unrecognised one-letter fragment is not evidence for a naming convention.
      if (!originalWord && tokens.length > 1 && token.length === 1 && !matches.length) base.meanings = [];
      item.prefix = !!prefix;
      const branch = async (term: TechnicalTerm, inferred: boolean): Promise<LearningBranch> => {
        const b: LearningBranch = { meanings: [meaning(term, inferred)], context: term.inference?.context_zh, rule: { ...term } };
        const pronunciation = this.termPronunciation(term, token);
        b.pronunciation = pronunciation.segments[0].status === 'resolved' ? pronunciation : base.pronunciation;
        if (prefix?.summary_zh) b.meanings.push({ ...meaning(term, inferred), text: prefix.summary_zh });
        if (!originalWord && term.expansion?.trim()) {
          const words: LearningItem[] = [];
          for (const [i, w] of (term.expansion.match(/[A-Za-z]+/g) || []).entries()) words.push(await make(w, i, true));
          b.expansion = { text: term.expansion, inferred, words };
        }
        return b;
      };
      if (matches.length) {
        for (const term of matches) item.branches.push(await branch(term, false));
      } else if (!originalWord) {
        // Priority applies across files, but genuinely different candidates within a file remain separate.
        let candidates: TechnicalTerm[] = [];
        for (const library of libraries) {
          candidates = library.filter(t => ['exact','insensitive'].includes(t.match) && (!t.symbol || t.symbol === result.text) &&
            (t.learning_only || !!t.expansion || !!t.inference) &&
            [t.token, ...(t.inference?.aliases || [])].some(s => s.toLowerCase() === token.toLowerCase()));
          if (candidates.some(t => t.symbol === result.text)) candidates = candidates.filter(t => t.symbol === result.text);
          if (candidates.length) break;
        }
        const eligible = candidates.filter(t => (t.inference?.requires_tokens || []).every(w => lower.includes(w.toLowerCase())));
        for (const term of eligible.length ? eligible : candidates) {
          const b = await branch(term, true);
          if (!eligible.length) {
            b.applicable = false;
            b.context = `适用条件未满足：${term.inference?.context_zh || term.inference?.requires_tokens?.join('、')}`;
          }
          item.branches.push(b);
        }
        if (candidates.length && !eligible.length) item.meanings = base.meanings;
      }
      if (!item.meanings.length) item.meanings = item.branches.length ? [] : base.meanings;
      const primary = new Set([...item.meanings, ...item.branches.flatMap(b => b.meanings)].map(m => m.text));
      if (item.branches.length && !prefix) item.dictionaryMeanings = base.meanings.filter(m => !primary.has(m.text));
      if (!item.meanings.length && !item.branches.length) item.meanings = [{ text: '释义暂缺', basis:'missing', source:'unavailable' }];
      const source = originalWord ? undefined : sourcePronunciations[index];
      item.pronunciation = source?.conflict ? undefined : source?.pronunciation || (item.branches.length === 1 ? item.branches[0].pronunciation : base.pronunciation);
      if (result.kind === 'project' && !source?.pronunciation && item.pronunciation?.segments[0]?.reading === 'silent') item.pronunciation = undefined;
      if (!originalWord && (/[0-9]/.test(tokens[index - 1] || '') || /[0-9]/.test(tokens[index + 1] || '')) && !source?.pronunciation) item.pronunciation = undefined;
      if (source?.conflict) item.branches.forEach(b => { b.pronunciation = undefined; });
      return item;
    };
    const items: LearningItem[] = [];
    for (const [index, token] of tokens.entries()) items.push(await make(token, index));
    if (generation !== this.generation) throw Error('词典配置已变化，请重新查询');
    return { state:'ready', symbol:result.text, items, diagnostics:[...diagnostics] };
  }

  async explainResult(symbol: string): Promise<QueryResult> {
    const general = await this.generalResult(symbol);
    if (general) return general;
    const settings = this.configure(), generation = this.generation;
    const libraries = await this.libraries(settings.technicalLibraryPaths);
    const prefixes = this.displayPrefixes(symbol, libraries);
    const components: Meaning[] = [];
    let cursor = 0;
    for (const [index, token] of splitIdentifier(symbol).entries()) {
      const start = symbol.indexOf(token, cursor); cursor = start + token.length;
      const numericAdjacent = /[0-9]/.test(symbol[start - 1] || '') || /[0-9]/.test(symbol[cursor] || '');
      if (/^\d+$/.test(token)) {
        components.push({ text: token, meanings: ['数字，未标注读音'], source: 'identifier' }); continue;
      }
      const matches = findTerms(libraries, symbol, token, index, false,
        (_name, _token, position) => prefixes.has(position), true);
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

  async hasExactWord(symbol: string): Promise<boolean> {
    const settings = this.configure();
    const libraries = await this.libraries(settings.technicalLibraryPaths);
    const words = libraries.map(library => library.filter(t => t.match === 'exact' || t.match === 'insensitive'));
    return findTerms(words, symbol, symbol, 0).some(t => !!t.translation.trim());
  }

  async explain(symbol: string): Promise<string> { return legacyResult(await this.explainResult(symbol)); }
}
