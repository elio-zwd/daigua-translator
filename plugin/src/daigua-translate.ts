import { ITranslate, ITranslateOptions, KnowledgePack } from './types';
import { KnowledgeLoader } from './knowledge-loader';
import { isLikelySingleSymbol, normalizeSymbol, formatEntry, formatEntries } from './symbol-matcher';

const bingTranslateApi = require('bing-translate-api');

const BING_LANG_MAP: Record<string, string> = {
  auto: 'auto-detect',
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
  zh: 'zh-Hans',
};

/** The provider is evaluated on each request, not just at construction. */
export class DaiguaTranslate implements ITranslate {
  readonly maxLen = 5000;
  private getPacks: () => KnowledgePack[];
  private loader = new KnowledgeLoader();

  constructor(packs: KnowledgePack[] | (() => KnowledgePack[]) = []) {
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
      const sym = normalizeSymbol(content);
      const matches = this.loader.findEntries(sym, this.getPacks());
      if (matches.length === 1) {
        return formatEntry(matches[0]);
      }
      if (matches.length > 1) {
        return formatEntries(matches);
      }
    }

    return this._bingFallback(content, from, to);
  }

  private async _bingFallback(content: string, from: string, to: string): Promise<string> {
    try {
      const sourceLang = BING_LANG_MAP[from] || from;
      const targetLang = BING_LANG_MAP[to] || to;
      const translateFn = bingTranslateApi.translate || bingTranslateApi.default || bingTranslateApi;
      const res = await translateFn(content, sourceLang, targetLang);
      return res && res.translation ? res.translation : (res ? String(res) : '');
    } catch (err: any) {
      console.error('[呆瓜翻译器] Bing 回退翻译失败:', err);
      return '[翻译失败: ' + (err?.message || '未知错误') + ']';
    }
  }

  link(_content: string, _options: ITranslateOptions): string {
    return '[呆瓜翻译器](https://github.com/elio-zwd/daigua-translator)';
  }
}
