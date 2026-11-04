import { ITranslate, ITranslateOptions, KnowledgePack } from './types';
import { KnowledgeLoader } from './knowledge-loader';
import { isLikelySingleSymbol, normalizeSymbol, formatEntry, formatEntries } from './symbol-matcher';

// The same Bing transport library used by MTranCode's built-in Bing source.
// MTranCode's public extension API does not expose the built-in translator instance.
const bingTranslateApi = require('bing-translate-api');

const BING_LANG_MAP: Record<string, string> = {
  auto: 'auto-detect',
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
  zh: 'zh-Hans',
};

export type BingTranslator = (
  content: string, from: string, to: string
) => Promise<{ translation?: string }>;

const defaultBingTranslator: BingTranslator =
  bingTranslateApi.translate || bingTranslateApi.default || bingTranslateApi;

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
      const result = await this.bingTranslator(
        content, BING_LANG_MAP[from] || from, BING_LANG_MAP[to] || to
      );
      // Do not return an error object/empty string as a successful translation.
      if (typeof result?.translation !== 'string' || !result.translation.trim()) {
        throw new Error('Bing 未返回有效译文');
      }
      return result.translation;
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
