import { BadRequestException } from '@nestjs/common'
import { z } from 'zod'

export const locale = z.enum(['vi', 'en', 'ru', 'zh'])
export type CmsLocale = z.infer<typeof locale>
const key = z.string().regex(/^[a-z][a-zA-Z0-9]{0,63}$/).refine(value => !['constructor', 'prototype'].includes(value))
export const fieldPath = z.union([z.tuple([key]), z.tuple([key, z.number().int().min(0).max(999), key])])
export type FieldPath = z.infer<typeof fieldPath>

const plain = z.string().max(5000).refine(value => !/[<>\u0000]/.test(value), 'Chỉ chấp nhận văn bản thuần')
export const blockChange = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), path: fieldPath, locale, value: plain }).strict(),
  z.object({
    kind: z.literal('media'), path: fieldPath, source: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('library'), mediaId: z.uuid() }).strict(),
      z.object({ kind: z.literal('block'), pageId: z.uuid(), blockId: z.uuid(), path: fieldPath }).strict(),
    ]),
  }).strict(),
])
export type BlockChange = z.infer<typeof blockChange>
export type MediaKind = 'image' | 'video'
type FieldKind = 'text' | MediaKind

const textFields = new Set([
  'title', 'titleAccent', 'middleTitle', 'subtitle', 'eyebrow', 'description', 'body', 'body2', 'caption',
  'alt', 'imageAlt', 'mapAlt', 'buttonLabel', 'label', 'brand', 'quote', 'author', 'heading',
  'logoText', 'menuLabel', 'wordmark', 'secondary', 'newsletterPlaceholder', 'newsletterMessage',
  'moreLabel', 'guestLabel', 'lowSeasonLabel', 'lowSeasonDates', 'highSeasonLabel', 'highSeasonDates',
  'rateNote', 'formNotice', 'consentLabel', 'allLabel', 'websiteLabel', 'contactLabel', 'emptyLabel',
  'features', 'placeholder',
])
const imageFields = new Set(['image', 'bgImage', 'backgroundImage', 'imageUrl', 'coverImage', 'poster', 'posterUrl', 'mapImage', 'logo', 'thumbnail', 'thumbnailUrl'])
const videoFields = new Set(['videoUrl', 'backgroundVideo'])
const listFields = ['items', 'categories', 'cards', 'images', 'pictures', 'slides', 'blockButtons'] as const

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function target(content: unknown, path: FieldPath) {
  const root = record(content)
  if (!root) return null
  if (path.length === 1) return { object: root, key: path[0] }
  const [list, index, name] = path
  const rows = root[list]
  if (!listFields.some(value => value === list) || !Array.isArray(rows)) return null
  const row = record(rows[index])
  return row ? { object: row, key: name } : null
}

/** Hillbrook seeds also store reusable defaults for fields hidden by a variant. */
function visibleForLayout(blockType: string, content: unknown, path: FieldPath) {
  const variant = record(content)?.variant
  const name = path[path.length - 1]
  const inList = path.length === 3
  if (typeof variant !== 'string') return true
  if (blockType === 'hillbrook') {
    if (inList && path[0] === 'items') {
      if (['hero', 'intro', 'video', 'banner'].includes(variant)) return false
      if (name === 'image' || name === 'alt') return !['header', 'footer', 'contact'].includes(variant)
      if (name === 'body') return !['header', 'footer'].includes(variant)
      if (name === 'eyebrow') return !['header', 'footer', 'contact'].includes(variant)
    }
    if (!inList) {
      if (name === 'body') return !['header', 'hero'].includes(variant)
      if (name === 'titleAccent') return variant !== 'header'
      if (name === 'buttonLabel') return !['hero', 'map', 'banner'].includes(variant)
      if (name === 'image' || name === 'imageAlt') return !['activities', 'gallery', 'services', 'footer', 'features'].includes(variant)
      if (name === 'bgImage') return !['hero', 'banner', 'contact'].includes(variant)
      if (name === 'videoUrl') return variant === 'video'
      if (name === 'mapImage' || name === 'mapAlt') return variant === 'contact'
    }
  }
  if (blockType === 'hillbrook_inner') {
    if (inList && path[0] === 'items') {
      if (name === 'image' || name === 'alt') return ['amenities', 'highlights', 'adventures', 'landscape', 'collage', 'vendors'].includes(variant)
      if (['hero', 'text', 'quote', 'cta', 'booking'].includes(variant)) return false
      if (name === 'body') return variant !== 'enquiry'
    }
    if (!inList) {
      if (name === 'image' || name === 'imageAlt') return ['hero', 'occasions', 'cta'].includes(variant)
      if (name === 'bgImage') return !['hero', 'occasions', 'cta'].includes(variant)
      if (name === 'buttonLabel') return !['hero', 'stats', 'quote', 'occasions'].includes(variant)
    }
  }
  return true
}

function fieldKind(name: string, value: unknown): FieldKind | null {
  if (typeof value === 'string' && imageFields.has(name)) return 'image'
  if (typeof value === 'string' && videoFields.has(name)) return 'video'
  if (!textFields.has(name)) return null
  if (typeof value === 'string') return /[<>\u0000]/.test(value) ? null : 'text'
  const translated = record(value)
  const fields = translated ? Object.entries(translated) : []
  return fields.length && fields.every(([lang, text]) =>
    locale.safeParse(lang).success && typeof text === 'string' && !/[<>\u0000]/.test(text)) ? 'text' : null
}

export function getBlockField(blockType: string, content: unknown, path: FieldPath) {
  const property = target(content, path)
  const value = property && Object.hasOwn(property.object, property.key) ? property.object[property.key] : undefined
  const kind = property && fieldKind(property.key, value)
  if (!property || !kind || !visibleForLayout(blockType, content, path)) {
    throw new BadRequestException('Trường này chưa được hỗ trợ chỉnh sửa qua MCP cho bố cục hiện tại.')
  }
  return { ...property, kind, value }
}

export function describeBlockFields(blockType: string, content: unknown, offset: number, limit: number) {
  const root = record(content)
  const result: Array<{ path: FieldPath; kind: FieldKind; locales?: readonly string[] }> = []
  const collect = (property: Record<string, unknown>, prefix?: [string, number]) => {
    for (const [name, value] of Object.entries(property)) {
      const path: FieldPath = prefix ? [...prefix, name] : [name]
      const kind = fieldKind(name, value)
      if (kind && visibleForLayout(blockType, content, path)) result.push({
        path,
        kind,
        ...(kind === 'text' ? { locales: typeof value === 'string' ? ['vi'] : locale.options } : {}),
      })
    }
  }
  if (root) {
    collect(root)
    for (const list of listFields) {
      const rows = root[list]
      if (!Array.isArray(rows)) continue
      rows.slice(0, 1000).forEach((row, index) => {
        const object = record(row)
        if (object) collect(object, [list, index])
      })
    }
  }
  return { fields: result.slice(offset, offset + limit), nextOffset: offset + limit < result.length ? offset + limit : null }
}

export function editBlockText(blockType: string, content: unknown, path: FieldPath, language: CmsLocale, text: string) {
  const field = getBlockField(blockType, content, path)
  if (field.kind !== 'text') throw new BadRequestException('Đường dẫn không phải trường văn bản.')
  if (typeof field.value === 'string') {
    if (language !== 'vi') throw new BadRequestException('Trường gốc chỉ có tiếng Việt.')
    field.object[field.key] = text
    return field.value
  }
  const translated = record(field.value)!
  field.object[field.key] = { ...translated, [language]: text }
  return translated[language] ?? null
}

export function mediaKindForUrl(url: string): MediaKind | null {
  if (!/^https:\/\//i.test(url) && !/^\/(?!\/)/.test(url)) return null
  if (/[\s<>\\\"'`]/.test(url)) return null
  const parsed = URL.parse(url, 'https://media.invalid')
  if (!parsed || parsed.username || parsed.password) return null
  const pathname = parsed.pathname
  if (/\.(avif|gif|jpe?g|png|svg|webp)$/i.test(pathname)) return 'image'
  if (/\.(mp4|webm|ogg|ogv|m4v)$/i.test(pathname)) return 'video'
  return null
}
