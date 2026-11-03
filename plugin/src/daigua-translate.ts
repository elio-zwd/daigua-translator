import { ITranslate, ITranslateOptions, KnowledgePack } from './types';
import { KnowledgeLoader } from './knowledge-loader';
import { isLikelySingleSymbol, normalizeSymbol, formatEntry, formatEntries } from './symbol-matcher';

// 动态载入 bing-translate-api 避免编译和类型冲突
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bingTranslateApi = require('bing-translate-api');

/** Bing 翻译语言映射表 */
const BING_LANG_MAP: Record<string, string> = {
  auto: 'auto-detect',
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
  zh: 'zh-Hans',
};

/**
 * 呆瓜翻译器核心翻译实现
 * 遵循 MTranCode 自定义翻译服务协议
 */
export class DaiguaTranslate implements ITranslate {
  readonly maxLen = 5000;
  private packs: KnowledgePack[] = [];
  private loader = new KnowledgeLoader();

  /**
   * 构造函数
   * @param packs 预先加载的知识包列表引用
   */
  constructor(packs: KnowledgePack[] = []) {
    this.packs = packs;
  }

  /**
   * 更新已加载的知识包
   */
  setPacks(packs: KnowledgePack[]): void {
    this.packs = packs;
  }

  /**
   * 翻译主入口
   * 1. 如果是单个 C/C++ 标识符，优先查询本地知识包
   * 2. 本地命中则直接返回中文说明
   * 3. 未命中或输入为多词/长文本时，自动回退到 Bing 翻译
   */
  async translate(content: string, { from = 'auto', to = 'zh-CN' }: ITranslateOptions): Promise<string> {
    if (!content || !content.trim()) {
      return '';
    }

    // 1. 单符号匹配判断
    if (isLikelySingleSymbol(content)) {
      const sym = normalizeSymbol(content);
      const matches = this.loader.findEntries(sym, this.packs);

      if (matches.length === 1) {
        return formatEntry(matches[0]);
      } else if (matches.length > 1) {
        return formatEntries(matches);
      }
      // matches 为空说明未收录，继续走下方 Bing 翻译
    }

    // 2. 未命中或长文本：自动回退 Bing 翻译
    return this._bingFallback(content, from, to);
  }

  /**
   * 回退到 Bing 翻译
   */
  private async _bingFallback(content: string, from: string, to: string): Promise<string> {
    try {
      const sourceLang = BING_LANG_MAP[from] || from;
      const targetLang = BING_LANG_MAP[to] || to;

      const translateFn = bingTranslateApi.translate || bingTranslateApi.default || bingTranslateApi;
      const res = await translateFn(content, sourceLang, targetLang);
      return res && res.translation ? res.translation : (res ? String(res) : '');
    } catch (err: any) {
      console.error('[呆瓜翻译器] Bing 回退翻译失败:', err);
      return `[翻译失败: ${err?.message || '未知错误'}]`;
    }
  }

  /**
   * 生成 Markdown 外部链接（显示在悬浮提示末尾）
   */
  link(_content: string, _options: ITranslateOptions): string {
    return '[呆瓜翻译器](https://github.com/xxnuo/MTranCode)';
  }
}
