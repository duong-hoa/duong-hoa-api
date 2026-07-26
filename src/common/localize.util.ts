// Shared locale-fallback helpers, ported from the multiple copies of this
// logic in src/lib/repos/public-cms.ts and src/lib/translate.ts.

import { resolveAssetContent } from './assets.util'

export function localizedText(value: unknown, locale: string): string {
  if (!value || typeof value !== 'object') return ''
  const text = value as Record<string, string>
  return text[locale] || text.vi || ''
}

type RawCategory = { id: string | null; name: Record<string, string> | null; slug?: string | null } | null

export type LocalizedCategory = { id: string; name: string; slug: string | null } | null

export function localizeCategory(raw: RawCategory, locale: string): LocalizedCategory {
  if (!raw?.id) return null
  return {
    id: raw.id,
    name: raw.name?.[locale] || raw.name?.vi || '',
    slug: raw.slug ?? null,
  }
}

// Recursive translation of a full content object/blob, mirroring
// src/lib/translate.ts's translateContent(): any key that looks like a
// { vi, en, ru, zh } localized map collapses to the requested locale
// (falling back to vi), everything else recurses/passes through untouched.
export function translateContent<T = unknown>(content: T, locale: string): T {
  const t = (val: unknown): unknown => {
    if (!val) return val
    if (typeof val === 'object') {
      if (Array.isArray(val)) {
        return val.map(t)
      }
      const obj = val as Record<string, unknown>
      if ('vi' in obj || 'en' in obj || 'ru' in obj || 'zh' in obj) {
        return (obj as Record<string, string>)[locale] ?? (obj as Record<string, string>).vi ?? ''
      }
      const res: Record<string, unknown> = {}
      for (const k in obj) {
        res[k] = t(obj[k])
      }
      return res
    }
    return val
  }
  return resolveAssetContent(t(content)) as T
}
