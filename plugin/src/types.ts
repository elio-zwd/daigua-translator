/** Independent translation and backward-compatible knowledge-pack data. */
export interface PronunciationSegment {
  text: string;
  reading: 'word' | 'letters' | 'silent' | 'unknown';
  phonetic?: string;
  source: string;
  status: 'resolved' | 'pending' | 'skipped';
  review_status?: 'unreviewed' | 'confirmed';
}

export interface Pronunciation { segments: PronunciationSegment[]; }

// ────────────────────────────────────────────────────────────
// 知识包结构
// ────────────────────────────────────────────────────────────

/** 词条中的参数描述 */
export interface ParameterEntry {
  name: string;
  type?: string;
  description_zh?: string;
  pronunciation?: Pronunciation;
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
  pronunciation?: Pronunciation;
}

/** 知识包顶层结构（对应一个 JSON 文件） */
export interface KnowledgePack {
  name: string;
  version: string;
  source_version?: string;
  description?: string;
  entries: KnowledgePackEntry[];
  pronunciation_metadata?: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────
// Independent translator options
// ────────────────────────────────────────────────────────────

/** 翻译选项 */
export interface ITranslateOptions {
  from?: string;
  to?: string;
}
