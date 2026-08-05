import { Injectable, NotFoundException } from '@nestjs/common'
import type { ContentBlock, Page, PageCategory, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { compact } from '../common/compact.util'
import { translateContent } from '../common/localize.util'
import { PageInputDto } from './dto/page-input.dto'
import { PageCategoryInputDto } from './dto/page-category-input.dto'
import { BlockInputDto, ReorderBlockDto } from './dto/block-input.dto'

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

  // ── Admin ────────────────────────────────────────────────────────────

  async getAdminPages() {
    const pages = await this.prisma.page.findMany({
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

      const created = await tx.page.create({
        data: {
          slug: input.slug as string,
          title: (input.title ?? page.title) as Prisma.InputJsonValue,
          description: (input.description ?? page.description) as Prisma.InputJsonValue,
          seoImage: input.seo_image ?? page.seoImage,
          audioUrl: input.audio_url ?? page.audioUrl,
          isPublished: false,
          sortOrder: input.sort_order ?? page.sortOrder + 5,
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
      where: { slug, isPublished: true },
      select: { title: true, description: true, seoImage: true },
    })
    if (!page) return null
    return { title: page.title, description: page.description, seo_image: page.seoImage }
  }

  async getPublishedPageStatus(slug: string) {
    const page = await this.prisma.page.findUnique({ where: { slug }, select: { id: true, isPublished: true, audioUrl: true } })
    if (!page) return null
    return { id: page.id, is_published: page.isPublished, audio_url: page.audioUrl }
  }

  async getPublishedNavPages() {
    const pages = await this.prisma.page.findMany({
      where: { isPublished: true },
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
      where: { slug, isPublished: true },
      select: { id: true, audioUrl: true },
    })
    if (!page) return null

    const blocks = await this.prisma.contentBlock.findMany({
      where: { pageId: page.id, isVisible: true },
      orderBy: { sortOrder: 'asc' },
    })
    if (!blocks.length) return null

    return blocks.map((block) => ({
      ...toBlockRow(block),
      content: translateContent(block.content, locale),
      audio_url: page.audioUrl,
    }))
  }
}
