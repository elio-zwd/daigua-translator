import { ITranslate, ITranslateOptions, KnowledgePack } from './types';
import { KnowledgeLoader } from './knowledge-loader';
import { isLikelySingleSymbol, normalizeSymbol, formatEntry, formatEntries } from './symbol-matcher';

import { BingTranslator, defaultBingTranslator, translateWithBing } from './bing';
export { BingTranslator } from './bing';

/** Reads the live knowledge-pack provider on every request. */
export class DaiguaTranslate implements ITranslate {
  // Match the length limit of MTranCode's built-in Bing translator.
  readonly maxLen = 1000;
  private getPacks: () => KnowledgePack[];
  private loader = new KnowledgeLoader();

  constructor(
    packs: KnowledgePack[] | (() => KnowledgePack[]) = [],
    private readonly bingTranslator: BingTranslator = defaultBingTranslator
  ) {
    this.getPacks = typeof packs === 'function' ? packs : () => packs;
  }

  setPacks(packs: KnowledgePack[]): void {
    this.getPacks = () => packs;
  }

  async translate(content: string, { from = 'auto', to = 'zh-CN' }: ITranslateOptions): Promise<string> {
    if (!content || !content.trim()) {
      return '';
    }

    if (isLikelySingleSymbol(content)) {
      const symbol = normalizeSymbol(content);
      const matches = this.loader.findEntries(symbol, this.getPacks());
      if (matches.length === 1) {
        return formatEntry(matches[0]);
      }
      if (matches.length > 1) {
        return formatEntries(matches);
      }
    }

    return this.bingFallback(content, from, to);
  }

  private async bingFallback(content: string, from: string, to: string): Promise<string> {
    try {
      return await translateWithBing(content, { from, to }, this.bingTranslator);
    } catch (error) {
      console.error('[呆瓜翻译器] Bing 回退失败:', error);
      // MTranCode's TranslateManager caches only successful Promise results.
      // Re-throwing prevents an error message from being cached as a translation.
      throw error;
    }
  }

  link(_content: string, _options: ITranslateOptions): string {
    return '[呆瓜翻译器](https://github.com/elio-zwd/daigua-translator)';
  }
}
