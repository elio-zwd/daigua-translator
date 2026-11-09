import { ITranslateOptions, KnowledgePack } from './types';
import { OfflineDictionary } from './offline-dictionary';
import { splitIdentifier } from './identifier-words';
import { KnowledgeIndex } from './knowledge-index';
import { isLikelySingleSymbol, normalizeSymbol, formatEntries } from './symbol-matcher';

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
    private readonly getSettings: () => TranslatorSettings = () => defaultSettings
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

  /** Shared entry point for automatic hovers and explicit commands. */
  async query(content: string, mode: 'online' | 'ecdict' | 'off', offline: OfflineDictionary): Promise<string> {
    if (!content.trim()) return '';
    if (content.length > this.maxLen) throw Error(`单次最多 ${this.maxLen} 字符，请缩小选区；原文未被截断。`);
    const matches = this.findLocalEntries(content);
    if (matches.length) return '呆瓜 · 本地知识包\n' + formatEntries(matches);
    if (mode === 'off') return '';
    const symbol = isLikelySingleSymbol(content) ? normalizeSymbol(content) : undefined;
    if (mode === 'ecdict' || !this.getSettings().bingEnabled) {
      if (!symbol) throw Error('联网翻译已关闭，无法提供整句译文；可查询单个名称的离线词典释义。');
      return offline.explain(symbol);
    }
    try {
      const text = symbol ? splitIdentifier(symbol).join(' ') : content;
      const result = await this.bingFallback(text, 'auto', 'zh-CN', this.getSettings().bingTimeoutMs);
      return `呆瓜 · Bing 联网翻译${symbol ? ' · 普通名称释义，用途未核对' : ''}\n${result}`;
    } catch (error) {
      if (!symbol) throw error;
      return `联网失败：${error instanceof Error ? error.message : String(error)}\n` + await offline.explain(symbol);
    }
  }

  async translate(content: string, { from = 'auto', to = 'zh-CN' }: ITranslateOptions): Promise<string> {
    if (!content || !content.trim()) {
      return '';
    }
    if (content.length > this.maxLen) throw Error(`单次最多 ${this.maxLen} 字符，请缩小选区。`);

    const matches = this.findLocalEntries(content);
    if (matches.length) return formatEntries(matches);
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
