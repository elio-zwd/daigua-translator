import * as fs from 'fs';
import * as path from 'path';
import { KnowledgePack, KnowledgePackEntry } from './types';

/**
 * 知识包加载与查询类
 */
export class KnowledgeLoader {
  /**
   * 从文件路径列表异步加载多个知识包
   * @param paths 知识包 JSON 绝对路径或相对路径列表
   */
  async loadFromPaths(paths: string[]): Promise<KnowledgePack[]> {
    const packs: KnowledgePack[] = [];

    for (const rawPath of paths) {
      if (!rawPath || typeof rawPath !== 'string') {
        continue;
      }
      const trimmed = rawPath.trim();
      if (!trimmed) {
        continue;
      }

      try {
        const resolvedPath = path.resolve(trimmed);
        if (!fs.existsSync(resolvedPath)) {
          console.warn(`[呆瓜翻译器] 知识包路径不存在: ${resolvedPath}`);
          continue;
        }

        const content = await fs.promises.readFile(resolvedPath, 'utf-8');
        const parsed = JSON.parse(content) as KnowledgePack;

        if (parsed && Array.isArray(parsed.entries)) {
          packs.push(parsed);
          console.log(`[呆瓜翻译器] 成功加载知识包: ${parsed.name || resolvedPath} (${parsed.entries.length} 词条)`);
        } else {
          console.warn(`[呆瓜翻译器] 知识包格式不合法 (缺少 entries 数组): ${resolvedPath}`);
        }
      } catch (err) {
        console.error(`[呆瓜翻译器] 加载知识包失败: ${trimmed}`, err);
      }
    }

    return packs;
  }

  /**
   * 在给定的知识包列表中按 symbol 精确匹配（大小写敏感）
   * @param symbol 规范化后的符号名称
   * @param packs 知识包列表
   * @returns 所有匹配的词条
   */
  findEntries(symbol: string, packs: KnowledgePack[]): KnowledgePackEntry[] {
    const matches: KnowledgePackEntry[] = [];
    if (!symbol) {
      return matches;
    }

    for (const pack of packs) {
      if (!pack.entries) {
        continue;
      }
      for (const entry of pack.entries) {
        if (entry.symbol === symbol) {
          matches.push(entry);
        }
      }
    }

    return matches;
  }
}
