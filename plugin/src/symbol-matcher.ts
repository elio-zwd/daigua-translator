import { KnowledgePackEntry } from './types';

/**
 * 判断输入是否为单个 C/C++ 标识符（支持末尾带 () 或带首尾空格）
 * 若包含多行、空格分隔的多个词、标点等，则视为普通文本，直接走翻译
 */
export function isLikelySingleSymbol(text: string): boolean {
  if (!text) {
    return false;
  }
  const trimmed = text.trim();
  // 匹配形如 Motor_Start, NFC_WriteU16LE, g_sys_tick_ms, 或 Motor_Start()
  const singleSymbolPattern = /^[a-zA-Z_][a-zA-Z0-9_]*(\s*\(\s*\))?$/;
  return singleSymbolPattern.test(trimmed);
}

/**
 * 规范化符号：去除首尾空白、剥离末尾的 ()
 */
export function normalizeSymbol(text: string): string {
  let s = text.trim();
  // 剥离末尾的空括号 ()
  if (s.endsWith('()')) {
    s = s.slice(0, -2).trim();
  } else if (s.endsWith(')')) {
    // 处理带内部空格的情况，例如 Motor_Start( )
    s = s.replace(/\s*\(\s*\)$/, '').trim();
  }
  return s;
}

/**
 * 格式化单条词条为展示文本
 */
export function formatEntry(entry: KnowledgePackEntry): string {
  const lines: string[] = [];

  // 标题行：【中文名】功能描述
  if (entry.name_zh && entry.description_zh) {
    lines.push(`【${entry.name_zh}】${entry.description_zh}`);
  } else if (entry.name_zh) {
    lines.push(`【${entry.name_zh}】`);
  } else if (entry.description_zh) {
    lines.push(entry.description_zh);
  } else {
    lines.push(`【${entry.symbol}】`);
  }

  // 声明
  if (entry.declaration) {
    lines.push(`声明：${entry.declaration}`);
  }

  // 参数列表
  if (Array.isArray(entry.parameters) && entry.parameters.length > 0) {
    lines.push('参数：');
    for (const p of entry.parameters) {
      lines.push(`  - ${p.name}：${p.description_zh || '无说明'}`);
    }
  }

  // 返回值
  if (entry.returns_zh) {
    lines.push(`返回值：${entry.returns_zh}`);
  }

  // 来源与作用域
  const scopeStr = entry.scope ? `作用域: ${entry.scope}` : '';
  const fileStr = entry.source?.file ? `${entry.source.file}${entry.source.line ? `:${entry.source.line}` : ''}` : '';
  const sourceParts = [scopeStr, fileStr].filter(Boolean);
  if (sourceParts.length > 0) {
    lines.push(`来源：${sourceParts.join(' | ')}`);
  }

  // 待确认说明
  if (entry.uncertainty) {
    lines.push(`（⚠️ 待确认：${entry.uncertainty}）`);
  }

  return lines.join('\n');
}

/**
 * 格式化多条同名但不同 scope 的词条
 */
export function formatEntries(entries: KnowledgePackEntry[]): string {
  if (entries.length === 0) {
    return '';
  }
  if (entries.length === 1) {
    return formatEntry(entries[0]);
  }

  const parts: string[] = [`找到 ${entries.length} 个同名符号说明：`];
  entries.forEach((item, idx) => {
    parts.push(`--- [候选 ${idx + 1}] ---`);
    parts.push(formatEntry(item));
  });

  return parts.join('\n');
}
