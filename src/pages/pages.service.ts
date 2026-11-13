import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { ContentBlock, Page, PageCategory } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { compact } from '../common/compact.util'
import { translateContent } from '../common/localize.util'
import { siteBlockKind, type SiteBlockKind } from '../common/site-block.util'
import { PageInputDto } from './dto/page-input.dto'
import { PageCategoryInputDto } from './dto/page-category-input.dto'
import { BlockInputDto, ReorderBlockDto } from './dto/block-input.dto'
import { CreatePageTemplateDto, PageTemplateCollectionNameDto, UpdatePageTemplateDto, UsePageTemplateDto } from './dto/page-template.dto'

// Row shapes returned to callers match the original snake_case Postgres
// columns from src/lib/repos/pages.ts exactly (not Prisma's camelCase model
// fields), so any future frontend integration sees the same wire format the
// raw-SQL repo produced.
function toPageRow(page: Page) {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    description: page.description,
    seo_image: page.seoImage,
    audio_url: page.audioUrl,
    is_published: page.isPublished,
    is_template: page.isTemplate,
    template_name: page.templateName,
    template_collection_id: page.templateCollectionId,
    sort_order: page.sortOrder,
    sub_nav: page.subNav,
    category_id: page.categoryId,
    created_at: page.createdAt,
    updated_at: page.updatedAt,
  }
}

function toPageCategoryRow(category: PageCategory) {
  return {
    id: category.id,
    name: category.name,
    sort_order: category.sortOrder,
    created_at: category.createdAt,
    updated_at: category.updatedAt,
  }
}

// Always present, with null fields when there's no linked category (left
// join semantics) — matches the `page_categories`/`category` join aliases
// used by the admin list vs. public nav queries respectively.
function toCategoryJoin(category: Pick<PageCategory, 'id' | 'name'> | null) {
  return {
    id: category?.id ?? null,
    name: (category?.name as Record<string, string> | null) ?? null,
  }
}

function toBlockRow(block: ContentBlock) {
  return {
    id: block.id,
    page_id: block.pageId,
    block_type: block.blockType,
    sort_order: block.sortOrder,
    content: block.content,
    is_visible: block.isVisible,
    label: block.label,
    created_at: block.createdAt,
    updated_at: block.updatedAt,
  }
}

function pageInputToPrisma(input: PageInputDto) {
  const payload = compact(input as Record<string, unknown>)
  // Unchecked variant so `categoryId` can be set as a plain scalar — using
  // the nested `category: { connect/disconnect }` relation form breaks on
  // create (`disconnect` is only valid when updating an existing row), and
  // this same builder is shared by both createPage and updatePage.
  const data: Prisma.PageUncheckedUpdateInput = {}
  if ('slug' in payload) data.slug = payload.slug as string
  if ('title' in payload) data.title = payload.title as Prisma.InputJsonValue
  if ('description' in payload) data.description = payload.description as Prisma.InputJsonValue
  if ('seo_image' in payload) data.seoImage = payload.seo_image as string | null
  if ('audio_url' in payload) data.audioUrl = payload.audio_url as string | null
  if ('is_published' in payload) data.isPublished = payload.is_published as boolean
  if ('sort_order' in payload) data.sortOrder = payload.sort_order as number
  if ('sub_nav' in payload) data.subNav = payload.sub_nav as Prisma.InputJsonValue
  if ('category_id' in payload) data.categoryId = payload.category_id as string | null
  return data
}

function blockInputToPrisma(input: BlockInputDto) {
  const payload = compact(input as Record<string, unknown>)
  const data: Prisma.ContentBlockUpdateInput = {}
  if ('block_type' in payload) data.blockType = payload.block_type as string
  if ('sort_order' in payload) data.sortOrder = payload.sort_order as number
  if ('content' in payload) data.content = payload.content as Prisma.InputJsonValue
  if ('is_visible' in payload) data.isVisible = payload.is_visible as boolean
  if ('label' in payload) data.label = payload.label as string | null
  return data
}

@Injectable()
export class PagesService {
  constructor(private readonly prisma: PrismaService) {}

  async getSiteBlockCandidates() {
    const blocks = await this.prisma.contentBlock.findMany({
      where: { isVisible: true, page: { isTemplate: false } },
      include: { page: { select: { slug: true, title: true, isPublished: true } } },
      orderBy: [{ page: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    })
    return blocks.flatMap(block => {
      const kind = siteBlockKind(block.blockType, block.content)
      return kind ? [{ id: block.id, kind, label: block.label, block_type: block.blockType, page_slug: block.page.slug, page_title: block.page.title, page_published: block.page.isPublished }] : []
    })
  }

  async getSiteBlocks(locale: string) {
    const settings = await this.prisma.siteSetting.findMany({ where: { key: { in: ['header_settings', 'footer_settings'] } } })
    const result: Record<SiteBlockKind, ReturnType<typeof toBlockRow> | null> = { header: null, footer: null }
    for (const kind of ['header', 'footer'] as const) {
      const value = settings.find(row => row.key === `${kind}_settings`)?.value
      const id = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>).blockId : null
      if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) continue
      // Selecting a specific block in site settings publishes that block alone,
      // even if its source page is a draft. Other draft blocks stay private.
      const block = await this.prisma.contentBlock.findFirst({ where: { id, isVisible: true, page: { isTemplate: false } } })
      if (block && siteBlockKind(block.blockType, block.content) === kind) result[kind] = { ...toBlockRow(block), content: translateContent(block.content, locale) }
    }
    return result
  }

  // ── Admin ────────────────────────────────────────────────────────────

  async getAdminPages() {
    const pages = await this.prisma.page.findMany({
      where: { isTemplate: false },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { sortOrder: 'asc' },
    })
    return pages.map((page) => ({ ...toPageRow(page), page_categories: toCategoryJoin(page.category) }))
  }

  async getAdminPageBySlug(slug: string) {
    const page = await this.prisma.page.findUnique({ where: { slug } })
    if (!page) return { page: null, blocks: [] }
    const blocks = await this.prisma.contentBlock.findMany({
      where: { pageId: page.id },
      orderBy: { sortOrder: 'asc' },
    })
    return { page: toPageRow(page), blocks: blocks.map(toBlockRow) }
  }

  async createPage(input: PageInputDto) {
    const page = await this.prisma.page.create({ data: pageInputToPrisma(input) as Prisma.PageUncheckedCreateInput })
    return toPageRow(page)
  }

  async updatePage(id: string, input: PageInputDto) {
    const current = await this.prisma.page.findUnique({ where: { id }, select: { isTemplate: true } })
    if (current?.isTemplate && input.is_published) throw new BadRequestException('Mẫu trang không thể xuất bản trực tiếp')
    const page = await this.prisma.page
      .update({ where: { id }, data: { ...pageInputToPrisma(input), updatedAt: new Date() } })
      .catch(() => null)
    return page ? toPageRow(page) : null
  }

  async deletePage(id: string) {
    await this.prisma.page.delete({ where: { id } })
  }

  async duplicatePage(id: string, input: PageInputDto) {
    return this.prisma.$transaction(async (tx) => {
      const page = await tx.page.findUnique({ where: { id } })
      if (!page) throw new NotFoundException('Không tìm thấy trang gốc')
      const description = input.description === undefined ? page.description : input.description

      const created = await tx.page.create({
        data: {
          slug: input.slug as string,
          title: (input.title ?? page.title) as Prisma.InputJsonValue,
          description: description === null ? Prisma.DbNull : description as Prisma.InputJsonValue,
          seoImage: input.seo_image ?? page.seoImage,
          audioUrl: input.audio_url ?? page.audioUrl,
          isPublished: false,
          sortOrder: input.sort_order ?? page.sortOrder + 5,
          subNav: page.subNav as Prisma.InputJsonValue,
          categoryId: page.categoryId,
        },
      })

      const blocks = await tx.contentBlock.findMany({ where: { pageId: id }, orderBy: { sortOrder: 'asc' } })
      for (const block of blocks) {
        await tx.contentBlock.create({
          data: {
            pageId: created.id,
            blockType: block.blockType,
            sortOrder: block.sortOrder,
            content: block.content as Prisma.InputJsonValue,
            isVisible: block.isVisible,
            label: block.label,
          },
        })
      }

      return toPageRow(created)
    })
  }

  // Templates are unpublished page records so the existing block editor,
  // localization and preview can be reused without serializing lossy copies.
  async getPageTemplates() {
    const templates = await this.prisma.page.findMany({
      where: { isTemplate: true },
      include: { _count: { select: { blocks: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return templates.map((template) => ({ ...toPageRow(template), block_count: template._count.blocks }))
  }

  async getPageTemplateCollections() {
    const collections = await this.prisma.pageTemplateCollection.findMany({ orderBy: [{ name: 'asc' }] })
    return Promise.all(collections.map(async collection => ({
      id: collection.id, name: collection.name,
      template_count: await this.prisma.page.count({ where: { isTemplate: true, templateCollectionId: collection.id } }),
      created_at: collection.createdAt, updated_at: collection.updatedAt,
    })))
  }

  async createPageTemplateCollection(input: PageTemplateCollectionNameDto) {
    const name = input.name.trim()
    if (!name) throw new BadRequestException('Vui lòng nhập tên bộ sưu tập')
    if (await this.prisma.pageTemplateCollection.findUnique({ where: { name }, select: { id: true } })) throw new BadRequestException('Tên bộ sưu tập đã tồn tại')
    const collection = await this.prisma.pageTemplateCollection.create({ data: { name } })
    return { id: collection.id, name: collection.name, template_count: 0, created_at: collection.createdAt, updated_at: collection.updatedAt }
  }

  async renamePageTemplateCollection(id: string, input: PageTemplateCollectionNameDto) {
    const name = input.name.trim()
    if (!name) throw new BadRequestException('Vui lòng nhập tên bộ sưu tập')
    const exists = await this.prisma.pageTemplateCollection.findUnique({ where: { id }, select: { id: true } })
    if (!exists) throw new NotFoundException('Không tìm thấy bộ sưu tập mẫu trang')
    if (await this.prisma.pageTemplateCollection.findFirst({ where: { name, id: { not: id } }, select: { id: true } })) throw new BadRequestException('Tên bộ sưu tập đã tồn tại')
    const collection = await this.prisma.pageTemplateCollection.update({ where: { id }, data: { name } })
    const template_count = await this.prisma.page.count({ where: { isTemplate: true, templateCollectionId: id } })
    return { id: collection.id, name: collection.name, template_count, created_at: collection.createdAt, updated_at: collection.updatedAt }
  }

  async deletePageTemplateCollection(id: string) {
    const collection = await this.prisma.pageTemplateCollection.findUnique({ where: { id }, select: { id: true } })
    if (!collection) throw new NotFoundException('Không tìm thấy bộ sưu tập mẫu trang')
    await this.prisma.pageTemplateCollection.delete({ where: { id } })
    return { success: true }
  }

  async createPageTemplate(input: CreatePageTemplateDto) {
    const name = input.name.trim()
    if (!name) throw new BadRequestException('Vui lòng nhập tên mẫu trang')
    if (input.source_page_id && input.blocks?.length) throw new BadRequestException('Chọn trang nguồn hoặc bộ block ban đầu')
    return this.prisma.$transaction(async (tx) => {
      const templateCollectionId = input.collection_id ? await tx.pageTemplateCollection.findUnique({ where: { id: input.collection_id }, select: { id: true } }).then(collection => {
        if (!collection) throw new BadRequestException('Không tìm thấy bộ sưu tập mẫu trang')
        return collection.id
      }) : null
      const source = input.source_page_id ? await tx.page.findUnique({ where: { id: input.source_page_id }, include: { blocks: { orderBy: { sortOrder: 'asc' } } } }) : null
      if (input.source_page_id && !source) throw new NotFoundException('Không tìm thấy trang nguồn')
      const created = await tx.page.create({ data: {
        slug: `mau-trang-${randomUUID()}`,
        title: (source?.title ?? { vi: name, en: '', ru: '', zh: '' }) as Prisma.InputJsonValue,
        ...(source ? { description: source.description === null ? Prisma.DbNull : source.description as Prisma.InputJsonValue } : {}),
        seoImage: source?.seoImage ?? null, audioUrl: source?.audioUrl ?? null,
        subNav: (source?.subNav ?? []) as Prisma.InputJsonValue, categoryId: source?.categoryId ?? null,
        isPublished: false, isTemplate: true, templateName: name, templateCollectionId,
      } })
      if (source) {
        for (const block of source.blocks) await tx.contentBlock.create({ data: {
          pageId: created.id, blockType: block.blockType, sortOrder: block.sortOrder,
          content: block.content as Prisma.InputJsonValue, isVisible: block.isVisible, label: block.label,
        } })
      } else {
        for (const [i, block] of (input.blocks ?? []).entries()) {
          if (!block.block_type) throw new BadRequestException('Block mẫu thiếu loại bố cục')
          await tx.contentBlock.create({ data: {
            pageId: created.id, blockType: block.block_type, sortOrder: block.sort_order ?? i,
            content: (block.content ?? {}) as Prisma.InputJsonValue, isVisible: block.is_visible ?? true, label: block.label,
          } })
        }
      }
      return toPageRow(created)
    })
  }

  async updatePageTemplate(id: string, input: UpdatePageTemplateDto) {
    const trimmed = input.name?.trim()
    if (input.name !== undefined && !trimmed) throw new BadRequestException('Vui lòng nhập tên mẫu trang')
    if (input.name === undefined && input.collection_id === undefined) throw new BadRequestException('Không có thay đổi để lưu')
    const template = await this.prisma.page.findFirst({ where: { id, isTemplate: true } })
    if (!template) throw new NotFoundException('Không tìm thấy mẫu trang')
    const templateCollectionId = input.collection_id === undefined
      ? template.templateCollectionId
      : input.collection_id
        ? await this.prisma.pageTemplateCollection.findUnique({ where: { id: input.collection_id }, select: { id: true } }).then(collection => {
          if (!collection) throw new BadRequestException('Không tìm thấy bộ sưu tập mẫu trang')
          return collection.id
        })
        : null
    return toPageRow(await this.prisma.page.update({ where: { id }, data: {
      ...(trimmed ? { templateName: trimmed } : {}), templateCollectionId, updatedAt: new Date(),
    } }))
  }

  async renamePageTemplate(id: string, name: string) {
    return this.updatePageTemplate(id, { name })
  }

  async deletePageTemplate(id: string) {
    const template = await this.prisma.page.findFirst({ where: { id, isTemplate: true }, select: { id: true } })
    if (!template) throw new NotFoundException('Không tìm thấy mẫu trang')
    await this.prisma.page.delete({ where: { id } })
    return { success: true }
  }

  async clonePageTemplate(id: string, name: string) {
    const template = await this.prisma.page.findFirst({ where: { id, isTemplate: true }, select: { id: true, templateCollectionId: true } })
    if (!template) throw new NotFoundException('Không tìm thấy mẫu trang')
    return this.createPageTemplate({ name, source_page_id: id, collection_id: template.templateCollectionId })
  }

  async usePageTemplate(id: string, input: UsePageTemplateDto) {
    const template = await this.prisma.page.findFirst({ where: { id, isTemplate: true }, select: { id: true } })
    if (!template) throw new NotFoundException('Không tìm thấy mẫu trang')
    const existing = await this.prisma.page.findUnique({ where: { slug: input.slug }, select: { id: true } })
    if (existing) throw new BadRequestException('Đường dẫn trang đã tồn tại')
    return this.duplicatePage(id, { slug: input.slug, title: input.title })
  }

  // ── Admin: blocks ────────────────────────────────────────────────────

  async createBlock(input: BlockInputDto) {
    if (!input.page_id) throw new NotFoundException('page_id is required')
    const block = await this.prisma.contentBlock.create({
      data: { pageId: input.page_id, ...blockInputToPrisma(input) } as Prisma.ContentBlockCreateInput,
    })
    return toBlockRow(block)
  }

  async updateBlock(id: string, input: BlockInputDto) {
    const block = await this.prisma.contentBlock
      .update({ where: { id }, data: { ...blockInputToPrisma(input), updatedAt: new Date() } })
      .catch(() => null)
    return block ? toBlockRow(block) : null
  }

  async deleteBlock(id: string) {
    await this.prisma.contentBlock.delete({ where: { id } })
  }

  async reorderBlocks(orderedBlocks: ReorderBlockDto[]) {
    await this.prisma.$transaction(
      orderedBlocks.map((block) =>
        this.prisma.contentBlock.update({
          where: { id: block.id },
          data: { sortOrder: block.sort_order, updatedAt: new Date() },
        }),
      ),
    )
  }

  // ── Admin: page categories ───────────────────────────────────────────

  async getPageCategories() {
    const categories = await this.prisma.pageCategory.findMany({ orderBy: { sortOrder: 'asc' } })
    return categories.map(toPageCategoryRow)
  }

  async createPageCategory(input: PageCategoryInputDto) {
    const payload = compact(input as Record<string, unknown>)
    const category = await this.prisma.pageCategory.create({
      data: {
        name: payload.name as Prisma.InputJsonValue,
        sortOrder: payload.sort_order as number | undefined,
      },
    })
    return toPageCategoryRow(category)
  }

  async updatePageCategory(id: string, input: PageCategoryInputDto) {
    const payload = compact(input as Record<string, unknown>)
    const data: Prisma.PageCategoryUpdateInput = { updatedAt: new Date() }
    if ('name' in payload) data.name = payload.name as Prisma.InputJsonValue
    if ('sort_order' in payload) data.sortOrder = payload.sort_order as number

    const category = await this.prisma.pageCategory.update({ where: { id }, data }).catch(() => null)
    return category ? toPageCategoryRow(category) : null
  }

  async deletePageCategory(id: string) {
    await this.prisma.pageCategory.delete({ where: { id } })
  }

  // ── Public ───────────────────────────────────────────────────────────

  async getPageMetaBySlug(slug: string) {
    const page = await this.prisma.page.findFirst({
      where: { slug, isPublished: true, isTemplate: false },
      select: { title: true, description: true, seoImage: true },
    })
    if (!page) return null
    return { title: page.title, description: page.description, seo_image: page.seoImage }
  }

  async getPublishedPageStatus(slug: string) {
    const page = await this.prisma.page.findFirst({ where: { slug, isTemplate: false }, select: { id: true, isPublished: true, audioUrl: true } })
    if (!page) return null
    return { id: page.id, is_published: page.isPublished, audio_url: page.audioUrl }
  }

  async getPublishedNavPages() {
    const pages = await this.prisma.page.findMany({
      where: { isPublished: true, isTemplate: false },
      orderBy: { sortOrder: 'asc' },
      select: {
        slug: true,
        title: true,
        subNav: true,
        categoryId: true,
        category: { select: { id: true, name: true } },
      },
    })
    return pages.map((page) => ({
      slug: page.slug,
      title: page.title,
      sub_nav: page.subNav,
      category_id: page.categoryId,
      category: page.category ? toCategoryJoin(page.category) : null,
    }))
  }

  async getPublishedPageBlocks(slug: string, locale = 'vi') {
    const page = await this.prisma.page.findFirst({
      where: { slug, isPublished: true, isTemplate: false },
      select: { id: true, audioUrl: true },
    })
    if (!page) return null

    const blocks = await this.prisma.contentBlock.findMany({
      where: { pageId: page.id, isVisible: true },
      orderBy: { sortOrder: 'asc' },
    })
    if (!blocks.length) return null

    const siteBlocks = await this.getSiteBlocks(locale)
    return blocks.filter(block => {
      const kind = siteBlockKind(block.blockType, block.content)
      return !kind || !siteBlocks[kind]
    }).map((block) => ({
      ...toBlockRow(block),
      content: translateContent(block.content, locale),
      audio_url: page.audioUrl,
    }))
  }
}
