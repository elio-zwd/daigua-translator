import { Pronunciation, PronunciationSegment } from './types';

const readings = new Set(['word', 'letters', 'silent', 'unknown']);
const statuses = new Set(['resolved', 'pending', 'skipped']);

/** Optional data never invalidates existing Chinese explanations. */
export function sanitizePronunciation(value: unknown, warn: (message: string) => void = () => {}): Pronunciation | undefined {
  if (!value || typeof value !== 'object' || !Array.isArray((value as Pronunciation).segments)) {
    warn('忽略无效 pronunciation：segments 必须是数组'); return;
  }
  const segments: PronunciationSegment[] = [];
  for (const item of (value as Pronunciation).segments) {
    if (!item || typeof item.text !== 'string' || !item.text.trim() ||
        !readings.has(item.reading) || !statuses.has(item.status) ||
        typeof item.source !== 'string' || !item.source.trim() ||
        (item.phonetic !== undefined && typeof item.phonetic !== 'string') ||
        (item.review_status !== undefined && !['unreviewed', 'confirmed'].includes(item.review_status)) ||
        (item.status === 'resolved' && (item.reading === 'unknown' ||
          (item.reading !== 'silent' && !item.phonetic?.trim())))) {
      warn('忽略无效 pronunciation 片段'); continue;
    }
    segments.push({ ...item });
  }
  return segments.length ? { segments } : undefined;
}

export function formatPronunciation(value?: Pronunciation): string {
  const valid = value && sanitizePronunciation(value);
  if (!valid) return '';
  return '音标：' + valid.segments.map(item => {
    const reading = item.status === 'pending' ? '读音暂缺' : item.reading === 'silent' ? '命名前缀，不发音' :
      item.status === 'skipped' ? '未标注读音' : `${item.reading === 'letters' ? '拼字母 ' : ''}/${item.phonetic}/`;
    return `${item.text} ${reading} [${item.source}]`;
  }).join('；');
}
