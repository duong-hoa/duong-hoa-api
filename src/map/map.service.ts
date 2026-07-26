import { Injectable } from '@nestjs/common'
import type { LocationCategory, MapLocation, Page, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { compact } from '../common/compact.util'
import { PagesService } from '../pages/pages.service'
import { MapLocationInputDto, LocationCategoryInputDto } from './dto/map-location-input.dto'

function toMapLocationRow(location: MapLocation) {
  return {
    id: location.id,
    name: location.name,
    description: location.description,
    lat: location.lat,
    lng: location.lng,
    icon_color: location.iconColor,
    sort_order: location.sortOrder,
    is_published: location.isPublished,
    google_maps_url: location.googleMapsUrl,
    category_id: location.categoryId,
    page_id: location.pageId,
    created_at: location.createdAt,
    updated_at: location.updatedAt,
  }
}

function toLocationCategoryRow(category: LocationCategory) {
  return {
    id: category.id,
    name: category.name,
    created_at: category.createdAt,
    updated_at: category.updatedAt,
  }
}

// Matches `jsonb_build_object('id', p.id, 'slug', p.slug, 'title', p.title)
// as pages` from src/lib/repos/map.ts — always present (null fields on no join).
function toPageJoin(page: Pick<Page, 'id' | 'slug' | 'title'> | null) {
  return { id: page?.id ?? null, slug: page?.slug ?? null, title: page?.title ?? null }
}

function toLocationCategoryJoin(category: Pick<LocationCategory, 'id' | 'name'> | null) {
  return { id: category?.id ?? null, name: category?.name ?? null }
}

function mapLocationInputToPrisma(input: MapLocationInputDto) {
  const payload = compact(input as Record<string, unknown>)
  const data: Prisma.MapLocationUpdateInput = {}
  if ('name' in payload) data.name = payload.name as Prisma.InputJsonValue
  if ('description' in payload) data.description = payload.description as Prisma.InputJsonValue
  if ('lat' in payload) data.lat = payload.lat as number
  if ('lng' in payload) data.lng = payload.lng as number
  if ('icon_color' in payload) data.iconColor = payload.icon_color as string
  if ('sort_order' in payload) data.sortOrder = payload.sort_order as number
  if ('is_published' in payload) data.isPublished = payload.is_published as boolean
  if ('google_maps_url' in payload) data.googleMapsUrl = payload.google_maps_url as string | null
  if ('category_id' in payload) {
    const categoryId = payload.category_id as string | null
    data.category = categoryId ? { connect: { id: categoryId } } : { disconnect: true }
  }
  if ('page_id' in payload) {
    const pageId = payload.page_id as string | null
    data.page = pageId ? { connect: { id: pageId } } : { disconnect: true }
  }
  return data
}

@Injectable()
export class MapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagesService: PagesService,
  ) {}

  // ── Admin ────────────────────────────────────────────────────────────

  async getAdminMapLocations() {
    const locations = await this.prisma.mapLocation.findMany({
      include: {
        category: { select: { id: true, name: true } },
        page: { select: { id: true, slug: true, title: true } },
      },
      orderBy: { sortOrder: 'asc' },
    })
    return locations.map((location) => ({
      ...toMapLocationRow(location),
      location_categories: toLocationCategoryJoin(location.category),
      pages: toPageJoin(location.page),
    }))
  }

  async getAdminMapData() {
    const [locations, categories, pages] = await Promise.all([
      this.getAdminMapLocations(),
      this.getLocationCategories(),
      this.pagesService.getAdminPages(),
    ])
    return { locations, categories, pages: pages.filter((page) => page.is_published) }
  }

  async createMapLocation(input: MapLocationInputDto) {
    const location = await this.prisma.mapLocation.create({
      data: mapLocationInputToPrisma(input) as Prisma.MapLocationCreateInput,
    })
    return toMapLocationRow(location)
  }

  async updateMapLocation(id: string, input: MapLocationInputDto) {
    const location = await this.prisma.mapLocation
      .update({ where: { id }, data: { ...mapLocationInputToPrisma(input), updatedAt: new Date() } })
      .catch(() => null)
    return location ? toMapLocationRow(location) : null
  }

  async deleteMapLocation(id: string) {
    await this.prisma.mapLocation.delete({ where: { id } })
  }

  async getLocationCategories() {
    const categories = await this.prisma.locationCategory.findMany({ orderBy: { createdAt: 'asc' } })
    return categories.map(toLocationCategoryRow)
  }

  async createLocationCategory(input: LocationCategoryInputDto) {
    const category = await this.prisma.locationCategory.create({
      data: { name: input.name as Prisma.InputJsonValue },
    })
    return toLocationCategoryRow(category)
  }

  async updateLocationCategory(id: string, input: LocationCategoryInputDto) {
    const category = await this.prisma.locationCategory
      .update({ where: { id }, data: { name: input.name as Prisma.InputJsonValue, updatedAt: new Date() } })
      .catch(() => null)
    return category ? toLocationCategoryRow(category) : null
  }

  async deleteLocationCategory(id: string) {
    await this.prisma.locationCategory.delete({ where: { id } })
  }

  // ── Public ───────────────────────────────────────────────────────────

  async getPublicMapLocations() {
    const locations = await this.prisma.mapLocation.findMany({
      where: { isPublished: true },
      include: { page: { select: { id: true, slug: true, title: true } } },
      orderBy: { sortOrder: 'asc' },
    })
    return locations.map((location) => ({
      ...toMapLocationRow(location),
      pages: toPageJoin(location.page),
    }))
  }
}
