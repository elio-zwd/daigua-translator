import { ITranslateOptions, KnowledgePack } from './types';
import { OfflineDictionary } from './offline-dictionary';
import { splitIdentifier } from './identifier-words';
import { KnowledgeIndex } from './knowledge-index';
import { QueryResult, projectResult, legacyResult } from './query-result';
import { isLikelySingleSymbol, normalizeSymbol } from './symbol-matcher';
import { identifyProject, LibraryProject } from './library-catalog';
import { supplementPronunciation } from './pronunciation';

import { BingTranslator, defaultBingTranslator, translateWithBing } from './bing';
export { BingTranslator } from './bing';

export interface TranslatorSettings {
  bingEnabled: boolean;
  bingTimeoutMs: number;
  includeParameters: boolean;
}

export const defaultSettings: TranslatorSettings = {
  bingEnabled: true, bingTimeoutMs: 5000, includeParameters: true,
};

/** Reads the live knowledge-pack provider on every request. */
export class DaiguaTranslate {
  readonly maxLen = 1000;
  private getPacks: () => KnowledgePack[];
  private index = new KnowledgeIndex();
  private pending = new Map<string, Promise<string>>();

  constructor(
    packs: KnowledgePack[] | (() => KnowledgePack[]) = [],
    private readonly bingTranslator: BingTranslator = defaultBingTranslator,
    private readonly getSettings: () => TranslatorSettings = () => defaultSettings,
    private readonly getContext: () => { documentPath?: string; projects: LibraryProject[] } = () => ({ projects: [] })
  ) {
    this.getPacks = typeof packs === 'function' ? packs : () => packs;
  }

  setPacks(packs: KnowledgePack[]): void {
    this.getPacks = () => packs;
  }

  findLocalEntries(content: string) {
    if (!isLikelySingleSymbol(content)) return [];
    return this.index.find(normalizeSymbol(content), this.getPacks(), this.getSettings().includeParameters);
  }

  sourceResult(content: string, documentPath = this.getContext().documentPath): QueryResult | undefined {
    const entries = this.findLocalEntries(content);
    if (!entries.length) return;
    const project = identifyProject(documentPath, this.getContext().projects);
    return projectResult(normalizeSymbol(content), entries, project.id, project.diagnostics);
  }

  /** Structured data shared by hover, commands and the fixed reader. */
  async queryResult(content: string, mode: 'online' | 'ecdict' | 'off', offline: OfflineDictionary,
    documentPath = this.getContext().documentPath, onPartial?: (result: QueryResult) => void): Promise<QueryResult | undefined> {
    const result = await this.lookupResult(content, mode, offline, documentPath);
    if (result?.kind === 'project' && result.candidates.some(c => !c.pronunciation?.segments.length ||
        c.pronunciation.segments.some(s => s.status === 'pending'))) {
      try {
        const fallback = await offline.pronunciationForSymbol(result.text);
        for (const candidate of result.candidates) {
          candidate.pronunciation = supplementPronunciation(result.text, candidate.pronunciation, fallback);
        }
      } catch { /* Preserve source explanations if the optional local lookup fails. */ }
    }
    if (result && isLikelySingleSymbol(content)) {
      try { result.nameDetails = await offline.nameDetails(normalizeSymbol(content)); }
      catch { /* Optional learning details must not prevent the original result. */ }
    }
    const symbol = isLikelySingleSymbol(content) ? normalizeSymbol(content) : undefined;
    if (result?.kind === 'dictionary' && result.match === 'components' && symbol && mode === 'online' &&
        this.getSettings().bingEnabled && splitIdentifier(symbol).length > 1) {
      try {
        // A local component hit normally ends lookup early; add whole-name Bing translation
        // without changing the local components or the selection of other lookup paths.
        if (await offline.hasLocalTerms(symbol) && this.getSettings().bingEnabled) {
          onPartial?.(result);
          const onlineTranslation = await this.bingFallback(splitIdentifier(symbol).join(' '), 'auto', 'zh-CN', this.getSettings().bingTimeoutMs);
          return { ...result, onlineTranslation };
        }
      } catch (error) {
        return { ...result, diagnostics: [...result.diagnostics,
          `联网补充失败：${error instanceof Error ? error.message : String(error)}`] };
      }
    }
    return result;
  }

  private async lookupResult(content: string, mode: 'online' | 'ecdict' | 'off', offline: OfflineDictionary, documentPath?: string): Promise<QueryResult | undefined> {
    if (!content.trim()) return;
    if (content.length > this.maxLen) throw Error(`单次最多 ${this.maxLen} 字符，请缩小选区；原文未被截断。`);
    const source = this.sourceResult(content, documentPath);
    if (source) return source;
    if (mode === 'off') return;
    const symbol = isLikelySingleSymbol(content) ? normalizeSymbol(content) : undefined;
    if (symbol) {
      const general = await offline.generalResult(symbol);
      if (general) return general;
      if (await offline.hasLocalTerms(symbol)) return offline.explainResult(symbol);
    }
    if (mode === 'ecdict' || !this.getSettings().bingEnabled) {
      if (!symbol) throw Error('联网翻译已关闭，无法提供整句译文；可查询单个名称的离线词典释义。');
      return offline.explainResult(symbol);
    }
    try {
      const text = symbol ? splitIdentifier(symbol).join(' ') : content;
      const result = await this.bingFallback(text, 'auto', 'zh-CN', this.getSettings().bingTimeoutMs);
      let pronunciation;
      if (symbol) {
        try { pronunciation = await offline.pronunciationForSymbol(symbol); }
        catch { /* Unavailable local pronunciation must not discard an online translation. */ }
      }
      return { text: symbol || content, kind: 'online', match: 'none', candidates: [{ name: result, pronunciation }], diagnostics: [] };
    } catch (error) {
      if (!symbol) throw error;
      const result = await offline.explainResult(symbol);
      result.diagnostics.unshift(`联网失败：${error instanceof Error ? error.message : String(error)}`);
      return result;
    }
  }

  async query(content: string, mode: 'online' | 'ecdict' | 'off', offline: OfflineDictionary): Promise<string> {
    const result = await this.queryResult(content, mode, offline);
    return result ? legacyResult(result) : '';
  }

  async translate(content: string, { from = 'auto', to = 'zh-CN' }: ITranslateOptions): Promise<string> {
    if (!content || !content.trim()) {
      return '';
    }
    if (content.length > this.maxLen) throw Error(`单次最多 ${this.maxLen} 字符，请缩小选区。`);

    const source = this.sourceResult(content);
    if (source) return legacyResult(source);
    const settings = this.getSettings();
    if (!settings.bingEnabled) {
      throw new Error('本地知识包未命中，Bing 回退已关闭。可用“呆瓜翻译器：本地查询”检查加载和词条。');
    }
    return this.bingFallback(content, from, to, settings.bingTimeoutMs);
  }

  private async bingFallback(content: string, from: string, to: string, timeoutMs: number): Promise<string> {
    const key = JSON.stringify([content, from, to]);
    let request = this.pending.get(key);
    if (!request) {
      if (this.pending.size >= 16) throw new Error('Bing 请求繁忙，请稍后重试或关闭 Bing 回退。');
      request = translateWithBing(content, { from, to }, this.bingTranslator);
      this.pending.set(key, request);
      // Keep deduplication until the transport actually settles, including after UI timeout.
      const remove = () => { if (this.pending.get(key) === request) this.pending.delete(key); };
      void request.then(remove, remove);
    }
    const limit = Number.isFinite(timeoutMs) ? Math.max(100, Math.min(30000, timeoutMs)) : 5000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([request, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Bing 等待超过 ${limit} ms；可关闭回退以仅查询本地包。`)), limit);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }

}
