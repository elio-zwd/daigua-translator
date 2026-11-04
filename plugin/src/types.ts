/**
 * types.ts
 * 知识包相关的 TypeScript 类型定义。
 * 同时手写 comment-translate-manager 所需的接口，
 * 避免依赖该旧版 npm 包的类型导出。
 */

// ────────────────────────────────────────────────────────────
// 知识包结构
// ────────────────────────────────────────────────────────────

/** 词条中的参数描述 */
export interface ParameterEntry {
  name: string;
  description_zh?: string;
}

/** 词条中的来源引用 */
export interface SourceRef {
  project?: string;
  file: string;
  line?: number;
}

/** 单条知识包词条（对应 entries[] 中的一个元素） */
export interface KnowledgePackEntry {
  symbol: string;
  kind: 'function' | 'variable' | 'macro' | 'enum' | 'typedef';
  name_zh: string;
  description_zh?: string;
  declaration?: string;
  parameters?: ParameterEntry[];
  returns_zh?: string;
  scope?: string;
  source: SourceRef;
  uncertainty?: string;
}

/** 知识包顶层结构（对应一个 JSON 文件） */
export interface KnowledgePack {
  name: string;
  version: string;
  source_version?: string;
  description?: string;
  entries: KnowledgePackEntry[];
}

// ────────────────────────────────────────────────────────────
// comment-translate-manager 接口（手写，绕过旧包类型问题）
// ────────────────────────────────────────────────────────────

/** 翻译选项 */
export interface ITranslateOptions {
  from?: string;
  to?: string;
}

/** 翻译器接口（MTranCode 要求实现） */
export interface ITranslate {
  /** 最大翻译字符数 */
  readonly maxLen: number;
  /** 执行翻译，返回翻译结果字符串 */
  translate(content: string, options: ITranslateOptions): Promise<string>;
  /** 返回外部链接（可为空字符串） */
  link(content: string, options: ITranslateOptions): string;
}

/** 翻译器构造函数类型 */
export type ITranslateConstructor = new () => ITranslate;

/** MTranCode 注册函数签名 */
export type ITranslateRegistry = (id: string, cls: ITranslateConstructor) => void;
