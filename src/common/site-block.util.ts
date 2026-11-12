export type SiteBlockKind = 'header' | 'footer'

// Only block variants whose renderers are complete site headers/footers.
export function siteBlockKind(type: string, content: unknown): SiteBlockKind | null {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null
  const c = content as Record<string, unknown>
  if ((type === 'heritage_showcase' || type === 'hillbrook') && (c.variant === 'header' || c.variant === 'footer')) return c.variant
  if (type === 'features_strip' && c.layoutVariant === 'travel-footer') return 'footer'
  return null
}
