// One-time migration: upgrades ContentBlock rows created from the old
// LAYOUT_OPTIONS presets (dkas-frontend/src/app/admin/(protected)/pages/[slug]/page.tsx)
// which stored translatable text fields as plain strings/arrays instead of
// the { vi, en, ru, zh } localized-object shape every admin form's
// getLangValue()/setLangValue()/getLangArray() actually expects. Blocks
// created after that preset fix already use the correct shape; this backfills
// blocks created before it. Idempotent — already-correct fields (objects) are
// left untouched, so it's safe to re-run.
//
// Usage: npx ts-node prisma/migrate-legacy-block-content.ts [--dry-run]

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes('--dry-run')

function wrapScalar(val: unknown): unknown {
  if (typeof val !== 'string') return val
  return { vi: val, en: '', ru: '', zh: '' }
}

function wrapArray(val: unknown): unknown {
  if (!Array.isArray(val)) return val
  return { vi: val, en: [], ru: [], zh: [] }
}

// For array-of-paragraph fields where each element is its OWN localized unit
// (e.g. split/split_cards' `body`: [{vi,en,ru,zh}, ...], edited one row at a
// time via getLangArrayValue/setLangArrayValue) — as opposed to wrapArray()'s
// shape, where the WHOLE array is localized at once (e.g. special_art_section/
// special_product_line's `body`: {vi:[...], en:[...]}, edited via getLangArray).
// Mixing these up reproduces the "body.map is not a function" bug fixed 2026-08-04.
function wrapParagraphArray(val: unknown): unknown {
  if (!Array.isArray(val)) return val
  return val.map((item) => (typeof item === 'string' ? wrapScalar(item) : item))
}

function wrapItems<T extends Record<string, unknown>>(
  arr: unknown,
  fields: Partial<Record<keyof T, 'scalar' | 'array'>>,
): unknown {
  if (!Array.isArray(arr)) return arr
  return arr.map((item) => {
    if (!item || typeof item !== 'object') return item
    const obj = { ...(item as Record<string, unknown>) }
    for (const [key, kind] of Object.entries(fields)) {
      if (!(key in obj)) continue
      obj[key] = kind === 'array' ? wrapArray(obj[key]) : wrapScalar(obj[key])
    }
    return obj
  })
}

// Per block_type: which top-level keys are scalar/array text fields, and
// which nested array fields need their items' sub-keys wrapped. Mirrors the
// exact field set fixed in LAYOUT_OPTIONS — anything not listed here (author,
// authorName, quoteAuthor, youtubeId, number, hotlines, videos[].title/desc,
// prefix, iconKey, ids, positions, etc.) is intentionally left as plain data.
const BLOCK_FIELD_MAP: Record<
  string,
  {
    scalar?: string[]
    array?: string[]
    paragraphArray?: string[]
    items?: Record<string, { scalar?: string[]; array?: string[] }>
  }
> = {
  hero: {
    scalar: ['title', 'eyebrow', 'subtitle', 'scrollLabel'],
    items: { buttons: { scalar: ['label'] } },
  },
  split: {
    scalar: ['eyebrow', 'title'],
    paragraphArray: ['body'],
    items: {
      infoCards: { scalar: ['title', 'body'] },
      miniCards: { scalar: ['label', 'text'] },
    },
  },
  split_cards: {
    scalar: ['eyebrow', 'title', 'subtitle'],
    paragraphArray: ['body'],
    items: { infoCards: { scalar: ['title', 'body'] } },
  },
  marquee: {
    array: ['items'],
  },
  quote_break: {
    scalar: ['eyebrow', 'quote'],
  },
  card_grid: {
    scalar: ['eyebrow', 'title', 'subtitle', 'bodyText'],
    items: { cards: { scalar: ['title', 'body'] } },
  },
  video_grid: {
    scalar: ['eyebrow', 'title', 'subtitle'],
  },
  features_strip: {
    items: { items: { scalar: ['title', 'subtitle'] } },
  },
  special_hero: {
    scalar: ['tag', 'titleLine1', 'titleLine2', 'quote', 'scrollLabel'],
  },
  special_art_section: {
    scalar: ['num', 'titleLine1', 'titleLine2'],
    array: ['body'],
  },
  special_reveal: {
    scalar: ['text'],
  },
  special_film: {
    scalar: ['kicker', 'videoTitle'],
  },
  special_gallery: {
    scalar: ['kicker'],
    items: { images: { scalar: ['alt'] } },
  },
  special_closing: {
    scalar: ['kicker', 'quoteLine1', 'quoteLine2', 'subLine1', 'subLine2', 'authorLabel', 'authorTitle'],
  },
  special_offer: {
    scalar: ['kicker', 'buttonLabel', 'activationHint', 'priceNote'],
  },
  special_size: {
    scalar: ['kicker', 'heightLabel', 'lengthLabel', 'label'],
    items: { specs: { scalar: ['label', 'value'] } },
  },
  special_product_line: {
    scalar: ['title', 'subtitle', 'priceLabel', 'priceValue', 'quote'],
    array: ['body'],
    items: {
      images: { scalar: ['alt'] },
      featureColumns: { scalar: ['title'], array: ['items'] },
    },
  },
}

async function main() {
  const blocks = await prisma.contentBlock.findMany()
  let changed = 0

  for (const block of blocks) {
    const map = BLOCK_FIELD_MAP[block.blockType]
    if (!map) continue

    const content = { ...(block.content as Record<string, unknown>) }
    let touched = false

    for (const key of map.scalar ?? []) {
      if (typeof content[key] === 'string') {
        content[key] = wrapScalar(content[key])
        touched = true
      }
    }
    for (const key of map.array ?? []) {
      if (Array.isArray(content[key])) {
        content[key] = wrapArray(content[key])
        touched = true
      }
    }
    for (const key of map.paragraphArray ?? []) {
      if (Array.isArray(content[key])) {
        const before = JSON.stringify(content[key])
        content[key] = wrapParagraphArray(content[key])
        if (JSON.stringify(content[key]) !== before) touched = true
      }
    }
    for (const [key, fields] of Object.entries(map.items ?? {})) {
      if (Array.isArray(content[key])) {
        const before = JSON.stringify(content[key])
        content[key] = wrapItems(content[key], fields as Record<string, 'scalar' | 'array'>)
        if (JSON.stringify(content[key]) !== before) touched = true
      }
    }

    if (!touched) continue

    changed++
    console.log(`${DRY_RUN ? '[dry-run] would update' : 'Updating'} block ${block.id} (${block.blockType})`)

    if (!DRY_RUN) {
      await prisma.contentBlock.update({
        where: { id: block.id },
        data: { content: content as never },
      })
    }
  }

  console.log(`${DRY_RUN ? 'Would update' : 'Updated'} ${changed} of ${blocks.length} block(s).`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
