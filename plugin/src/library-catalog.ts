import * as fs from 'fs';
import * as path from 'path';
import { TechnicalTerm, validateTerms } from './offline-dictionary';
import { KnowledgePack } from './types';
import { validateKnowledgePack } from './pack-validation';

export interface LibraryProject { id: string; name: string; source_roots: string[]; symbol_libraries: string[]; }
export interface LibraryCatalog {
  format_version: 1;
  word_libraries: string[];
  naming_libraries: string[];
  dictionary_path?: string;
  projects: LibraryProject[];
}
export interface LibrarySnapshot {
  directory: string; catalog: LibraryCatalog; files: string[];
  data: Map<string, TechnicalTerm[] | KnowledgePack>;
  words: TechnicalTerm[][]; naming: TechnicalTerm[][]; packs: KnowledgePack[];
  projects: LibraryProject[]; dictionaryPath: string;
  counts: { words: number; naming: number; symbols: number };
  failures: { path: string; reason: string; retained: boolean }[];
  warnings: string[];
}
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(s => typeof s === 'string' && !!s.trim());
const key = (file: string) => path.resolve(file).toLowerCase();
export function catalogPath(root: string, relative: string): string {
  if (!relative.trim() || path.isAbsolute(relative) || path.win32.parse(relative).root || relative.split(/[\\/]/).includes('..'))
    throw Error('词库文件必须使用目录内的相对路径');
  return path.resolve(root, relative);
}
export function validateCatalog(value: unknown, directory: string): LibraryCatalog {
  const c = value as LibraryCatalog;
  if (!c || c.format_version !== 1 || !strings(c.word_libraries) || !strings(c.naming_libraries) || !Array.isArray(c.projects) ||
      (c.dictionary_path !== undefined && typeof c.dictionary_path !== 'string')) throw Error('library.json 格式不兼容');
  const ids = new Set<string>(), files = new Set<string>();
  const add = (file: string) => {
    const resolved = key(catalogPath(directory, file));
    if (files.has(resolved)) throw Error('清单重复启用词库文件：' + file);
    files.add(resolved);
  };
  c.word_libraries.forEach(add); c.naming_libraries.forEach(add);
  for (const p of c.projects) {
    if (!p || typeof p.id !== 'string' || !p.id.trim() || typeof p.name !== 'string' || !p.name.trim() ||
        !strings(p.source_roots) || !strings(p.symbol_libraries) || ids.has(p.id)) throw Error('工程 ID、名称或目录配置无效');
    ids.add(p.id); p.symbol_libraries.forEach(add);
  }
  return c;
}
export function validateRole(value: unknown, role: 'words' | 'naming'): TechnicalTerm[] {
  const terms = validateTerms(value);
  if (terms.some(t => role === 'words' ? !['exact', 'insensitive'].includes(t.match) : !['prefix', 'identifier'].includes(t.match)))
    throw Error(role === 'words' ? '词语释义库只接受 exact、insensitive 词条' : '命名约定库只接受 prefix、identifier 词条');
  return terms;
}
export async function loadLibrary(directory: string, previous?: LibrarySnapshot): Promise<LibrarySnapshot> {
  const root = path.resolve(directory), manifest = path.join(root, 'library.json');
  const catalog = validateCatalog(JSON.parse((await fs.promises.readFile(manifest, 'utf8')).replace(/^\uFEFF/, '')), root);
  const next: LibrarySnapshot = { directory: root, catalog, files: [manifest], data: new Map(), words: [], naming: [], packs: [],
    projects: catalog.projects.map(p => ({ ...p, source_roots: p.source_roots.map(r => path.resolve(root, r)) })),
    dictionaryPath: catalog.dictionary_path?.trim() ? path.resolve(root, catalog.dictionary_path) : '',
    counts: { words: 0, naming: 0, symbols: 0 }, failures: [], warnings: [] };
  const read = async (relative: string, role: 'words' | 'naming' | 'symbols', projectId?: string) => {
    const file = catalogPath(root, relative); next.files.push(file);
    let data: TechnicalTerm[] | KnowledgePack | undefined;
    try {
      const value = JSON.parse((await fs.promises.readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
      data = role === 'symbols' ? validateKnowledgePack(value, warning => next.warnings.push(`${file}: ${warning}`)) : validateRole(value, role);
    } catch (error) {
      // A file changing roles must be validated again, even when retaining old data.
      const old = previous && key(previous.directory) === key(root) ? previous.data.get(key(file)) : undefined;
      if (old && (role === 'symbols' ? !Array.isArray(old) : Array.isArray(old) &&
          old.every(t => role === 'words' ? ['exact', 'insensitive'].includes(t.match) : ['prefix', 'identifier'].includes(t.match)))) data = old;
      next.failures.push({ path: file, reason: String(error), retained: !!data });
    }
    if (!data) return;
    next.data.set(key(file), data);
    if (role === 'symbols') {
      const pack = data as KnowledgePack;
      next.packs.push({ ...pack, origin: { projectId, libraryPath: file } }); next.counts.symbols += pack.entries.length;
    } else { next[role].push(data as TechnicalTerm[]); next.counts[role] += (data as TechnicalTerm[]).length; }
  };
  for (const file of catalog.word_libraries) await read(file, 'words');
  for (const file of catalog.naming_libraries) await read(file, 'naming');
  for (const p of catalog.projects) for (const file of p.symbol_libraries) await read(file, 'symbols', p.id);
  if (next.dictionaryPath) next.files.push(path.join(next.dictionaryPath, 'manifest.json'));
  return next;
}
export function identifyProject(file: string | undefined, projects: LibraryProject[]): { id?: string; diagnostics: string[] } {
  if (!file) return { diagnostics: [] };
  const canonical = (s: string) => path.win32.normalize(s.replace(/\//g, '\\')).replace(/\\+$/, '').toLowerCase();
  const target = canonical(file);
  let length = -1; const ids = new Set<string>();
  for (const p of projects) for (const r of p.source_roots) {
    const root = canonical(r);
    if (target !== root && !target.startsWith(root + '\\')) continue;
    if (root.length > length) { length = root.length; ids.clear(); }
    if (root.length === length) ids.add(p.id);
  }
  return ids.size > 1 ? { diagnostics: ['源码根目录归属冲突，按其他工程参考展示。'] }
    : { id: [...ids][0], diagnostics: [] };
}
