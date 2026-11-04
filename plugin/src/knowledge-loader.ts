import * as fs from 'fs';
import * as path from 'path';
import { KnowledgePack, KnowledgePackEntry } from './types';
import { validateKnowledgePack } from './pack-validation';

export interface PackLoadFailure { path: string; reason: string; retained: boolean; }
export interface PackLoadReport {
  byPath: Map<string, KnowledgePack>;
  packs: KnowledgePack[];
  loadedCount: number;
  failures: PackLoadFailure[];
}

export function resolvePackPaths(paths: string[]): string[] {
  return [...new Set(paths.filter(p => typeof p === 'string' && p.trim())
    .map(p => path.resolve(p.trim())))];
}

export class KnowledgeLoader {
  constructor(private readonly readFile: (file: string) => Promise<string> =
    file => fs.promises.readFile(file, 'utf8')) {}

  /** Candidate snapshot: only the caller's latest reload may commit it. */
  async loadWithReport(paths: string[], previous = new Map<string, KnowledgePack>()): Promise<PackLoadReport> {
    const byPath = new Map<string, KnowledgePack>();
    const failures: PackLoadFailure[] = [];
    let loadedCount = 0;
    for (const file of resolvePackPaths(paths)) {
      try {
        const parsed = validateKnowledgePack(JSON.parse((await this.readFile(file)).replace(/^\uFEFF/, '')));
        byPath.set(file, parsed);
        loadedCount++;
      } catch (error) {
        const old = previous.get(file);
        if (old) byPath.set(file, old);
        failures.push({ path: file, reason: error instanceof Error ? error.message : String(error), retained: !!old });
      }
    }
    return { byPath, packs: [...byPath.values()], loadedCount, failures };
  }

  async loadFromPaths(paths: string[]): Promise<KnowledgePack[]> {
    return (await this.loadWithReport(paths)).packs;
  }

  findEntries(symbol: string, packs: KnowledgePack[]): KnowledgePackEntry[] {
    return symbol ? packs.flatMap(pack => pack.entries.filter(entry => entry.symbol === symbol)) : [];
  }
}
