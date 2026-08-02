import { Injectable, NotFoundException } from '@nestjs/common'
import type { Post, PostCategory, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { compact } from '../common/compact.util'
import { localizedText, localizeCategory } from '../common/localize.util'
import { PostInputDto } from './dto/post-input.dto'
import { PostCategoryInputDto } from './dto/post-category-input.dto'

function toPostRow(post: Post) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    content: post.content,
    cover_image: post.coverImage,
    is_published: post.isPublished,
    published_at: post.publishedAt,
    category_id: post.categoryId,
    created_at: post.createdAt,
    updated_at: post.updatedAt,
  }
}

function toPostCategoryRow(category: PostCategory) {
  return {
    id: category.id,
    name: category.name,
    sort_order: category.sortOrder,
    slug: category.slug,
    description: category.description,
    created_at: category.createdAt,
    updated_at: category.updatedAt,
  }
}

// Matches `jsonb_build_object('id', pc.id, 'name', pc.name, 'slug', pc.slug)
// as post_categories` from src/lib/repos/posts.ts — always present, with
// null fields when there's no linked category (left join semantics).
function toCategoryJoin(category: Pick<PostCategory, 'id' | 'name' | 'slug'> | null) {
  return {
    id: category?.id ?? null,
    name: (category?.name as Record<string, string> | null) ?? null,
    slug: category?.slug ?? null,
  }
}

function postInputToPrisma(input: PostInputDto) {
  const payload = compact(input as Record<string, unknown>)
  // Unchecked variant so `categoryId` can be set as a plain scalar — the
  // nested `category: { connect/disconnect }` relation form breaks on
  // create (`disconnect` is only valid when updating an existing row), and
  // this same builder is shared by both createPost and updatePost.
  const data: Prisma.PostUncheckedUpdateInput = {}
  if ('slug' in payload) data.slug = payload.slug as string
  if ('title' in payload) data.title = payload.title as Prisma.InputJsonValue
  if ('summary' in payload) data.summary = payload.summary as Prisma.InputJsonValue
  if ('content' in payload) data.content = payload.content as Prisma.InputJsonValue
  if ('cover_image' in payload) data.coverImage = payload.cover_image as string | null
  if ('is_published' in payload) data.isPublished = payload.is_published as boolean
  if ('published_at' in payload) data.publishedAt = new Date(payload.published_at as string)
  if ('category_id' in payload) data.categoryId = payload.category_id as string | null
  return data
}

function localizePost(row: ReturnType<typeof toPostRow>, join: ReturnType<typeof toCategoryJoin>, locale: string) {
  return {
    ...row,
    title: localizedText(row.title, locale),
    summary: localizedText(row.summary, locale),
    content: localizedText(row.content, locale),
    category: localizeCategory(join, locale),
  }
}

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Admin: posts ─────────────────────────────────────────────────────

  async getAdminPosts() {
    const posts = await this.prisma.post.findMany({
      include: { category: { select: { id: true, name: true, slug: true } } },
      orderBy: { publishedAt: 'desc' },
    })
    return posts.map((post) => ({
      id: post.id,
      slug: post.slug,
      title: post.title,
      cover_image: post.coverImage,
      is_published: post.isPublished,
      published_at: post.publishedAt,
      category_id: post.categoryId,
      post_categories: toCategoryJoin(post.category),
    }))
  }

  async getAdminPostById(id: string) {
    const post = await this.prisma.post.findUnique({ where: { id } })
    return post ? toPostRow(post) : null
  }

  async getAdminPostBySlug(slug: string) {
    const post = await this.prisma.post.findUnique({ where: { slug }, select: { id: true } })
    return post ?? null
  }

  async createPost(input: PostInputDto) {
    const post = await this.prisma.post.create({ data: postInputToPrisma(input) as Prisma.PostUncheckedCreateInput })
    return toPostRow(post)
  }

  async updatePost(id: string, input: PostInputDto) {
    const post = await this.prisma.post
      .update({ where: { id }, data: { ...postInputToPrisma(input), updatedAt: new Date() } })
      .catch(() => null)
    return post ? toPostRow(post) : null
  }

  async deletePost(id: string) {
    await this.prisma.post.delete({ where: { id } })
  }

  async duplicatePost(id: string, slug: string, title: unknown) {
    const original = await this.prisma.post.findUnique({ where: { id } })
    if (!original) throw new NotFoundException('Không tìm thấy bài viết gốc')

    const post = await this.prisma.post.create({
      data: {
        slug,
        title: title as Prisma.InputJsonValue,
        summary: (original.summary ?? { vi: '', en: '', ru: '', zh: '' }) as Prisma.InputJsonValue,
        content: (original.content ?? { vi: '', en: '', ru: '', zh: '' }) as Prisma.InputJsonValue,
        coverImage: original.coverImage,
        categoryId: original.categoryId ?? null,
        isPublished: false,
        publishedAt: new Date(),
      },
    })
    return toPostRow(post)
  }

  // ── Admin: post categories ───────────────────────────────────────────

  async getPostCategories() {
    const categories = await this.prisma.postCategory.findMany({ orderBy: { sortOrder: 'asc' } })
    return categories.map(toPostCategoryRow)
  }

  async createPostCategory(input: PostCategoryInputDto) {
    const payload = compact(input as Record<string, unknown>)
    const category = await this.prisma.postCategory.create({
      data: {
        name: payload.name as Prisma.InputJsonValue,
        slug: (payload.slug as string | undefined) ?? undefined,
        description: payload.description as Prisma.InputJsonValue | undefined,
        sortOrder: payload.sort_order as number | undefined,
      },
    })
    return toPostCategoryRow(category)
  }

  async updatePostCategory(id: string, input: PostCategoryInputDto) {
    const payload = compact(input as Record<string, unknown>)
    const data: Prisma.PostCategoryUpdateInput = { updatedAt: new Date() }
    if ('name' in payload) data.name = payload.name as Prisma.InputJsonValue
    if ('slug' in payload) data.slug = payload.slug as string | null
    if ('description' in payload) data.description = payload.description as Prisma.InputJsonValue
    if ('sort_order' in payload) data.sortOrder = payload.sort_order as number

    const category = await this.prisma.postCategory.update({ where: { id }, data }).catch(() => null)
    return category ? toPostCategoryRow(category) : null
  }

  async deletePostCategory(id: string) {
    await this.prisma.postCategory.delete({ where: { id } })
  }

  // ── Public ───────────────────────────────────────────────────────────

  async getPublishedPosts(locale = 'vi') {
    const posts = await this.prisma.post.findMany({
      where: { isPublished: true },
      include: { category: { select: { id: true, name: true, slug: true } } },
      orderBy: { publishedAt: 'desc' },
    })
    return posts.map((post) => localizePost(toPostRow(post), toCategoryJoin(post.category), locale))
  }

  async getPublishedPostBySlug(slug: string, locale = 'vi') {
    const post = await this.prisma.post.findFirst({
      where: { slug, isPublished: true },
      include: { category: { select: { id: true, name: true, slug: true } } },
    })
    return post ? localizePost(toPostRow(post), toCategoryJoin(post.category), locale) : null
  }

  async getPublishedPostsByCategory(categorySlug: string, locale = 'vi') {
    const posts = await this.prisma.post.findMany({
      where: { isPublished: true, category: { slug: categorySlug } },
      include: { category: { select: { id: true, name: true, slug: true } } },
      orderBy: { publishedAt: 'desc' },
    })
    return posts.map((post) => localizePost(toPostRow(post), toCategoryJoin(post.category), locale))
  }

  async getPublishedPostCategories(locale = 'vi') {
    const categories = await this.prisma.postCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, slug: true },
    })
    return categories.map((cat) => ({
      id: cat.id,
      name: (cat.name as Record<string, string> | null)?.[locale] || (cat.name as Record<string, string> | null)?.vi || '',
      slug: cat.slug,
    }))
  }

  async getPublishedPostCategoriesFull(locale = 'vi') {
    const categories = await this.prisma.postCategory.findMany({
      where: { slug: { not: null } },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, slug: true, description: true },
    })
    return categories
      .filter((cat) => cat.slug)
      .map((cat) => ({
        id: cat.id,
        name: (cat.name as Record<string, string> | null)?.[locale] || (cat.name as Record<string, string> | null)?.vi || '',
        slug: cat.slug as string,
        description:
          (cat.description as Record<string, string> | null)?.[locale] ||
          (cat.description as Record<string, string> | null)?.vi ||
          '',
      }))
  }
}
