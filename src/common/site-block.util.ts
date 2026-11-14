export type SiteBlockKind = 'header' | 'footer'
export type SiteChromeMode = 'none' | 'block' | 'default'

/** Preserve the legacy block-ID-only configuration. */
export function siteChromeMode(value: unknown): SiteChromeMode {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'default'
  const config = value as Record<string, unknown>
  if (config.mode === 'none' || config.mode === 'block' || config.mode === 'default') return config.mode
  return typeof config.blockId === 'string' && config.blockId.trim() ? 'block' : 'default'
}

export function siteBlockLocalLinks(value: unknown): string[] {
  const links = new Set<string>()
  function visit(item: unknown, key = '') {
    if (typeof item === 'string' && /href$/i.test(key) && item.trim().startsWith('#') && item.trim().length > 1) links.add(item.trim())
    else if (Array.isArray(item)) item.forEach(entry => visit(entry, key))
    else if (item && typeof item === 'object') Object.entries(item).forEach(([name, entry]) => visit(entry, /href$/i.test(key) ? key : name))
  }
  visit(value)
  return [...links]
}

export function siteHeaderMissingLinks(value: unknown): string[] {
  const missing: string[] = []
  const text = (item: unknown): string => typeof item === 'string' ? item : item && typeof item === 'object' ? text((item as Record<string, unknown>).vi || (item as Record<string, unknown>).en) : ''
  function visit(items: unknown) {
    if (!Array.isArray(items)) return
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      if (Array.isArray(item.children) && item.children.length) { visit(item.children); continue }
      const href = text(item.href).trim()
      if (!/^(\/(?!\/)|#|https?:\/\/|mailto:|tel:)/i.test(href)) missing.push(text(item.title) || 'Mục điều hướng chưa đặt tên')
    }
  }
  if (value && typeof value === 'object') visit((value as Record<string, unknown>).items)
  return missing
}

// Only block variants whose renderers are complete site headers/footers.
export function siteBlockKind(type: string, content: unknown): SiteBlockKind | null {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null
  const c = content as Record<string, unknown>
  if ((type === 'heritage_showcase' || type === 'hillbrook' || type === 'hba') && (c.variant === 'header' || c.variant === 'footer')) return c.variant
  if (type === 'features_strip' && c.layoutVariant === 'travel-footer') return 'footer'
  if (type === 'lusano' && c.variant === 'header') return 'header'
  return null
}
