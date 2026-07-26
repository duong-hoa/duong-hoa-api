import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { PagesService } from '../pages/pages.service'
import { PostsService } from '../posts/posts.service'
import { SiteSettingsDto } from './dto/site-settings.dto'

const ADMIN_SETTINGS_KEYS = [
  'site_title',
  'site_description',
  'contact_email',
  'social_links',
  'enabled_languages',
  'show_blog',
]

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagesService: PagesService,
    private readonly postsService: PostsService,
  ) {}

  async getSetting<T = unknown>(key: string): Promise<T | null> {
    const row = await this.prisma.siteSetting.findUnique({ where: { key } })
    return (row?.value as T) ?? null
  }

  async setSetting(key: string, value: unknown) {
    await this.prisma.siteSetting.upsert({
      where: { key },
      update: { value: value as Prisma.InputJsonValue, updatedAt: new Date() },
      create: { key, value: value as Prisma.InputJsonValue },
    })
  }

  async getAdminSettings() {
    const rows = await this.prisma.siteSetting.findMany({
      where: { key: { in: ADMIN_SETTINGS_KEYS } },
      orderBy: { key: 'asc' },
    })
    return Object.fromEntries(rows.map((row) => [row.key, row.value]))
  }

  async setAdminSettings(settings: SiteSettingsDto) {
    for (const [key, value] of Object.entries(settings)) {
      if (value === undefined) continue
      await this.setSetting(key, value)
    }
  }

  async getAdminBlogSettings() {
    return this.getSetting('blog_settings')
  }

  async setAdminBlogSettings(value: unknown) {
    await this.setSetting('blog_settings', value)
  }

  // ── Public ───────────────────────────────────────────────────────────

  async isBlogVisible(): Promise<boolean> {
    const value = await this.getSetting<unknown>('show_blog')
    if (value === null) return true
    return value === true || value === 'true'
  }

  async getBlogSettings(locale = 'vi') {
    const settings = await this.getSetting<Record<string, Record<string, string>>>('blog_settings')
    if (!settings) return null
    return {
      list_label: settings.list_label?.[locale] || settings.list_label?.vi || '',
      list_title: settings.list_title?.[locale] || settings.list_title?.vi || '',
      list_subtitle: settings.list_subtitle?.[locale] || settings.list_subtitle?.vi || '',
    }
  }

  // Mirrors src/lib/public-actions.ts:getPublicHeaderData.
  async getPublicHeaderData(locale: string, includeBlogCategories: boolean) {
    const [blogSettings, enabledLanguages, showBlog, pages, categories] = await Promise.all([
      this.getBlogSettings(locale),
      this.getSetting<string[]>('enabled_languages'),
      this.isBlogVisible(),
      this.pagesService.getPublishedNavPages(),
      includeBlogCategories ? this.postsService.getPublishedPostCategories(locale) : Promise.resolve([]),
    ])

    return {
      blogTitle: blogSettings?.list_title ?? '',
      enabledLanguages: enabledLanguages?.length ? enabledLanguages : ['vi', 'en', 'ru', 'zh'],
      showBlog,
      pages,
      categories,
    }
  }

  // Mirrors src/lib/public-actions.ts:getPublicFooterPages.
  async getPublicFooterPages() {
    return this.pagesService.getPublishedNavPages()
  }
}
