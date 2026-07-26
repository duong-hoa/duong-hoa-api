// Direct port of src/lib/assets.ts from the Next.js app so stored object
// paths (e.g. "uploads/example.jpg") resolve to public URLs the same way.

function configuredAssetBases(): string[] {
  return [process.env.NEXT_PUBLIC_ASSET_BASE_URL, process.env.S3_PUBLIC_BASE_URL]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/\/+$/, ''))
}

function isDataOrBlobUrl(value: string) {
  return /^(data|blob):/i.test(value)
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value)
}

function stripConfiguredAssetBase(value: string): string | null {
  for (const base of configuredAssetBases()) {
    if (value === base) return ''
    if (value.startsWith(`${base}/`)) {
      return value.slice(base.length + 1)
    }
  }
  return null
}

function stripKnownStorageBase(value: string): string | null {
  return stripConfiguredAssetBase(value)
}

function normalizeStoragePath(value: string) {
  let path = value.trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (path.startsWith('media/')) path = path.slice('media/'.length)
  return path
}

export function assetUrlToStoragePath(value?: string | null): string {
  if (!value) return ''

  const trimmed = value.trim()
  if (!trimmed) return ''

  const stripped = stripKnownStorageBase(trimmed)
  if (stripped !== null) return normalizeStoragePath(stripped)

  if (isDataOrBlobUrl(trimmed) || isHttpUrl(trimmed) || trimmed.startsWith('/')) {
    return trimmed
  }

  return normalizeStoragePath(trimmed)
}

export function resolveAssetUrl(value?: string | null): string {
  if (!value) return ''

  const trimmed = value.trim()
  if (!trimmed) return ''

  if (isDataOrBlobUrl(trimmed)) return trimmed

  const stripped = stripKnownStorageBase(trimmed)
  if (stripped === null && (isHttpUrl(trimmed) || trimmed.startsWith('/'))) {
    return trimmed
  }

  const path = normalizeStoragePath(stripped ?? trimmed)
  if (!path) return ''

  const base = configuredAssetBases()[0]
  return base ? `${base}/${path}` : `/${path}`
}

export function resolveAssetContent<T>(value: T): T {
  if (typeof value === 'string') {
    const normalized = assetUrlToStoragePath(value)
    if (normalized.startsWith('uploads/') || normalized.startsWith('migrated/')) {
      return resolveAssetUrl(normalized) as unknown as T
    }
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveAssetContent(item)) as unknown as T
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, resolveAssetContent(item)]),
    ) as unknown as T
  }

  return value
}
