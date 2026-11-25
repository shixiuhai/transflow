import type { LanguageDef } from './types';

/**
 * Internal language codes follow a BCP-47-ish subset. Each provider maps these
 * to its own codes. `auto` is only valid as a source language.
 */
export const LANGUAGES: LanguageDef[] = [
  { code: 'auto', name: '自动检测', englishName: 'Auto detect' },
  { code: 'zh', name: '简体中文', englishName: 'Chinese (Simplified)' },
  { code: 'zh-TW', name: '繁体中文', englishName: 'Chinese (Traditional)' },
  { code: 'en', name: '英语', englishName: 'English' },
  { code: 'ja', name: '日语', englishName: 'Japanese' },
  { code: 'ko', name: '韩语', englishName: 'Korean' },
  { code: 'fr', name: '法语', englishName: 'French' },
  { code: 'de', name: '德语', englishName: 'German' },
  { code: 'es', name: '西班牙语', englishName: 'Spanish' },
  { code: 'ru', name: '俄语', englishName: 'Russian' },
  { code: 'pt', name: '葡萄牙语', englishName: 'Portuguese' },
  { code: 'it', name: '意大利语', englishName: 'Italian' },
  { code: 'ar', name: '阿拉伯语', englishName: 'Arabic' },
  { code: 'th', name: '泰语', englishName: 'Thai' },
  { code: 'vi', name: '越南语', englishName: 'Vietnamese' },
  { code: 'id', name: '印尼语', englishName: 'Indonesian' },
  { code: 'tr', name: '土耳其语', englishName: 'Turkish' },
  { code: 'hi', name: '印地语', englishName: 'Hindi' },
];

export type ProviderLangKind = 'volc' | 'baidu' | 'deepl' | 'google' | 'openai';

const VOLC: Record<string, string> = {
  auto: '',
  zh: 'zh',
  'zh-TW': 'zh-Hant',
  en: 'en',
  ja: 'ja',
  ko: 'ko',
  fr: 'fr',
  de: 'de',
  es: 'es',
  ru: 'ru',
  pt: 'pt',
  it: 'it',
  ar: 'ar',
  th: 'th',
  vi: 'vi',
  id: 'id',
  tr: 'tr',
  hi: 'hi',
};

const BAIDU: Record<string, string> = {
  auto: 'auto',
  zh: 'zh',
  'zh-TW': 'cht',
  en: 'en',
  ja: 'jp',
  ko: 'kor',
  fr: 'fra',
  de: 'de',
  es: 'spa',
  ru: 'ru',
  pt: 'pt',
  it: 'it',
  ar: 'ara',
  th: 'th',
  vi: 'vie',
  id: 'id',
  tr: 'tr',
  hi: 'hi',
};

const DEEPL: Record<string, string> = {
  auto: '',
  zh: 'ZH',
  'zh-TW': 'ZH',
  en: 'EN',
  ja: 'JA',
  ko: 'KO',
  fr: 'FR',
  de: 'DE',
  es: 'ES',
  ru: 'RU',
  pt: 'PT-PT',
  it: 'IT',
  ar: 'AR',
  th: 'TH',
  vi: 'VI',
  id: 'ID',
  tr: 'TR',
  hi: 'HI',
};

const GOOGLE: Record<string, string> = {
  auto: 'auto',
  zh: 'zh-CN',
  'zh-TW': 'zh-TW',
  en: 'en',
  ja: 'ja',
  ko: 'ko',
  fr: 'fr',
  de: 'de',
  es: 'es',
  ru: 'ru',
  pt: 'pt',
  it: 'it',
  ar: 'ar',
  th: 'th',
  vi: 'vi',
  id: 'id',
  tr: 'tr',
  hi: 'hi',
};

export function toProviderCode(code: string, kind: ProviderLangKind): string {
  const table =
    kind === 'volc' ? VOLC : kind === 'baidu' ? BAIDU : kind === 'deepl' ? DEEPL : kind === 'google' ? GOOGLE : null;
  if (!table) return code;
  return table[code] ?? code;
}

/** Best-effort normalization for languages detected by providers. */
export function fromProviderCode(code: string, kind: ProviderLangKind): string {
  if (!code) return 'auto';
  const normalized = code.toLowerCase();
  if (kind === 'baidu' && normalized === 'cht') return 'zh-TW';
  if (kind === 'baidu' && normalized === 'jp') return 'ja';
  if (kind === 'baidu' && normalized === 'kor') return 'ko';
  if (normalized.startsWith('zh')) return normalized.includes('tw') || normalized.includes('hant') ? 'zh-TW' : 'zh';
  return normalized.split('-')[0] ?? code;
}

export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? code;
}

/** Crude script-based target guess used by input-box translation. */
export function guessTargetForText(text: string): string {
  const han = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = (text.match(/[a-zA-Z]/g) ?? []).length;
  if (han > latin) return 'en';
  return 'zh';
}
