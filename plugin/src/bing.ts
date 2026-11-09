import { ITranslateOptions } from './types';

// Independent transport; no host extension or translation source is required.
const languages: Record<string, string> = {
  auto: 'auto-detect', 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant', zh: 'zh-Hans'
};
export type BingTranslator = (content: string, from: string, to: string) => Promise<{ translation?: string }>;
export const defaultBingTranslator: BingTranslator = (content, from, to) =>
  require('bing-translate-api').translate(content, from, to);

export async function translateWithBing(content: string, { from = 'auto', to = 'zh-CN' }: ITranslateOptions,
  transport: BingTranslator = defaultBingTranslator): Promise<string> {
  const result = await transport(content, languages[from] || from, languages[to] || to);
  if (typeof result?.translation !== 'string' || !result.translation.trim()) {
    throw new Error('Bing 未返回有效译文');
  }
  return result.translation;
}
