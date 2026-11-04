import * as path from 'path';
import { KnowledgePack } from './types';

const kinds = new Set(['function', 'variable', 'macro', 'enum', 'typedef']);
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Mirrors validator/validate.py's structural checks without needing the source tree. */
export function validateKnowledgePack(value: unknown): KnowledgePack {
  const errors: string[] = [];
  const text = (v: unknown, label: string, required = false): void => {
    if (typeof v !== 'string' || (required && !v.trim())) {
      errors.push(`${label} 必须是${required ? '非空' : ''}字符串`);
    }
  };
  const optionalText = (obj: Record<string, unknown>, keys: string[], label: string): void => {
    for (const key of keys) if (key in obj) text(obj[key], `${label}.${key}`);
  };
  if (!isObject(value)) throw new Error('知识包根节点必须是对象');
  text(value.name, 'name', true);
  text(value.version, 'version', true);
  optionalText(value, ['source_version', 'description'], '知识包');
  if (!Array.isArray(value.entries)) throw new Error('entries 必须是数组');
  const seen = new Set<string>();
  value.entries.forEach((entry: unknown, index: number) => {
    const label = `词条 #${index + 1}`;
    if (!isObject(entry)) { errors.push(`${label} 必须是对象`); return; }
    for (const field of ['symbol', 'kind', 'name_zh']) text(entry[field], `${label}.${field}`, true);
    if (typeof entry.symbol === 'string' &&
        (entry.symbol.trim() !== entry.symbol || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(entry.symbol))) {
      errors.push(`${label}.symbol 不是合法的 C/C++ 标识符`);
    }
    if (!kinds.has(entry.kind as string)) errors.push(`${label}: 非法 kind`);
    optionalText(entry, ['description_zh', 'declaration', 'returns_zh', 'scope', 'uncertainty'], label);
    const key = JSON.stringify([entry.scope ?? '', entry.symbol]);
    if (seen.has(key)) errors.push(`${label}: 重复词条`);
    seen.add(key);
    if (!isObject(entry.source)) errors.push(`${label}.source 必须是对象`);
    else {
      const source = entry.source;
      text(source.file, `${label}.source.file`, true);
      optionalText(source, ['project'], `${label}.source`);
      if ('line' in source && (!Number.isSafeInteger(source.line) || (source.line as number) <= 0)) {
        errors.push(`${label}.source.line 必须是正整数`);
      }
      if (typeof source.file === 'string') {
        const file = source.file.replace(/\\/g, '/');
        if (path.posix.isAbsolute(file) || path.win32.parse(file).root ||
            file.split('/').includes('..') || /[\x00-\x1f<>:"|?*]/.test(file)) {
          errors.push(`${label}.source.file 必须是安全的相对路径`);
        }
      }
    }
    if ('parameters' in entry) {
      if (!Array.isArray(entry.parameters)) errors.push(`${label}.parameters 必须是数组`);
      else {
        const names = new Set<string>();
        entry.parameters.forEach((param: unknown, i: number) => {
          const pLabel = `${label}.parameters[${i + 1}]`;
          if (!isObject(param)) { errors.push(`${pLabel} 必须是对象`); return; }
          text(param.name, `${pLabel}.name`, true);
          optionalText(param, ['description_zh', 'type'], pLabel);
          if (typeof param.name === 'string') {
            if (names.has(param.name)) errors.push(`${pLabel}: 重复参数名`);
            names.add(param.name);
          }
        });
      }
    }
  });
  if (errors.length) throw new Error(errors.join('\n'));
  return value as unknown as KnowledgePack;
}
