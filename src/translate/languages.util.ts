// Port of src/lib/languages.ts.
export const SUPPORTED_LANGUAGES = [
  { code: 'vi', name: 'Tiếng Việt (Gốc)' },
  { code: 'en', name: 'English' },
  { code: 'ru', name: 'Русский' },
  { code: 'zh', name: '中文' },
] as const

export type LangCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

export function getTargetLangs(sourceLang: string): string[] {
  return SUPPORTED_LANGUAGES.map((l) => l.code).filter((c) => c !== sourceLang)
}
