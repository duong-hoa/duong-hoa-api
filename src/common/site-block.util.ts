export type SiteBlockKind = 'header' | 'footer'

// Only block variants with renderers in the production frontend.
export function siteBlockKind(type: string, content: unknown): SiteBlockKind | null {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null
  const c = content as Record<string, unknown>
  if (type === 'heritage_showcase' && (c.variant === 'header' || c.variant === 'footer')) return c.variant
  if (type === 'features_strip' && c.layoutVariant === 'travel-footer') return 'footer'
  return null
}
