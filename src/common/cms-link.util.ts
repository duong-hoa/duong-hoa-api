type CopyContext = { blockIds: ReadonlyMap<string, string>; sourceSlug: string; targetSlug: string }

/** Copy links with the page, without rewriting prose, media sources or links to other pages. */
export function remapCmsLinks<T>(value: T, context: CopyContext): T {
  const anchor = (input: string) => {
    for (const [oldId, newId] of context.blockIds) {
      if (input === oldId) return newId
      const prefix = `editorial-${oldId.replace(/[^a-zA-Z0-9_-]/g, '')}-`
      if (input.startsWith(prefix)) return `editorial-${newId.replace(/[^a-zA-Z0-9_-]/g, '')}-${input.slice(prefix.length)}`
    }
    return input
  }
  const href = (input: string) => {
    if (input.startsWith('#')) return `#${anchor(input.slice(1))}`
    if (!/^\/(?!\/)/.test(input)) return input
    const hash = input.indexOf('#')
    const head = hash < 0 ? input : input.slice(0, hash)
    const query = head.indexOf('?')
    const pathname = query < 0 ? head : head.slice(0, query)
    const match = pathname.match(/^\/(vi|en|ru|zh)\/(.*)$/)
    const slug = match ? match[2] : pathname.slice(1)
    if (slug !== context.sourceSlug) return input
    return `${match ? `/${match[1]}` : ''}/${context.targetSlug}${query < 0 ? '' : head.slice(query)}${hash < 0 ? '' : `#${anchor(input.slice(hash + 1))}`}`
  }
  const visit = (item: unknown, key = ''): unknown => {
    if (typeof item === 'string') {
      if (/href$/i.test(key)) return href(item)
      if (key === 'anchor') return anchor(item)
      return item
    }
    if (Array.isArray(item)) return item.map(entry => visit(entry))
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([name, entry]) => [name, visit(entry, name)]))
    return item
  }
  return visit(value) as T
}
