import { ITranslate, ITranslateOptions, KnowledgePack } from './types';
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
export class DaiguaTranslate implements ITranslate {
  // Match the length limit of MTranCode's built-in Bing translator.
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

  async translate(content: string, { from = 'auto', to = 'zh-CN' }: ITranslateOptions): Promise<string> {
    if (!content || !content.trim()) {
      return '';
    }

    const matches = this.findLocalEntries(content);
    if (matches.length) return formatEntries(matches);
    const settings = this.getSettings();
    if (!settings.bingEnabled) {
      // Reject rather than let MTranCode cache a diagnostic as a successful translation.
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

  link(_content: string, _options: ITranslateOptions): string {
    return '[呆瓜翻译器](https://github.com/elio-zwd/daigua-translator)';
  }
}
