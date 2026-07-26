import { Controller, Get, Param, Query } from '@nestjs/common'
import { PagesService } from './pages.service'

// Mirrors src/lib/public-actions.ts (getPublicPageMeta/getPublicPageStatus)
// and the published-page reads in src/lib/repos/public-cms.ts.
@Controller('public')
export class PagesPublicController {
  constructor(private readonly pagesService: PagesService) {}

  @Get('nav-pages')
  getNavPages() {
    return this.pagesService.getPublishedNavPages()
  }

  @Get('pages/:slug/meta')
  getPageMeta(@Param('slug') slug: string) {
    return this.pagesService.getPageMetaBySlug(slug)
  }

  @Get('pages/:slug/status')
  getPageStatus(@Param('slug') slug: string) {
    return this.pagesService.getPublishedPageStatus(slug)
  }

  @Get('pages/:slug/blocks')
  getPageBlocks(@Param('slug') slug: string, @Query('locale') locale?: string) {
    return this.pagesService.getPublishedPageBlocks(slug, locale || 'vi')
  }
}
