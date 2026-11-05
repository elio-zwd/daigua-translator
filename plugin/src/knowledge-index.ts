import { KnowledgePack, KnowledgePackEntry } from './types';

/** Rebuild only when the active pack snapshot or parameter setting changes. */
export class KnowledgeIndex {
  private snapshot?: KnowledgePack[];
  private includeParameters = true;
  private entries = new Map<string, KnowledgePackEntry[]>();

  find(symbol: string, packs: KnowledgePack[], includeParameters = true): KnowledgePackEntry[] {
    if (this.snapshot !== packs || this.includeParameters !== includeParameters) {
      const entries = new Map<string, KnowledgePackEntry[]>();
      const add = (entry: KnowledgePackEntry) => {
        const candidates = entries.get(entry.symbol) || [];
        candidates.push(entry);
        entries.set(entry.symbol, candidates);
      };
      for (const pack of packs) {
        for (const entry of pack.entries) {
          add(entry);
          if (includeParameters && entry.kind === 'function') {
            for (const parameter of entry.parameters || []) {
              if (!/^[A-Za-z_]\w*$/.test(parameter.name) || !parameter.description_zh?.trim()) continue;
              add({
                symbol: parameter.name, kind: 'variable',
                name_zh: `${entry.symbol} 的参数 ${parameter.name}`,
                description_zh: parameter.description_zh,
                declaration: parameter.type,
                scope: `${entry.scope || entry.source.file}::${entry.symbol}::参数`,
                source: entry.source,
                uncertainty: entry.uncertainty,
              });
            }
          }
        }
      }
      this.entries = entries;
      this.snapshot = packs;
      this.includeParameters = includeParameters;
    }
    return this.entries.get(symbol) || [];
  }
}
