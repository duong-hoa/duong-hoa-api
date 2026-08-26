import { Controller, Get, Query } from '@nestjs/common'
import { SettingsService } from './settings.service'

// Mirrors getPublicHeaderData/getPublicFooterPages from src/lib/public-actions.ts,
// plus the standalone isBlogVisible/getBlogSettings reads from
// src/lib/repos/public-cms.ts (re-exported through src/lib/cms.ts) that
// callers use independently of the composite header payload.
@Controller('public')
export class SettingsPublicController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('header')
  getHeaderData(@Query('locale') locale?: string, @Query('includeBlogCategories') includeBlogCategories?: string) {
    return this.settingsService.getPublicHeaderData(locale || 'vi', includeBlogCategories === 'true')
  }

  @Get('footer/pages')
  getFooterPages() {
    return this.settingsService.getPublicFooterPages()
  }

  @Get('blog-settings')
  getBlogSettings(@Query('locale') locale?: string) {
    return this.settingsService.getBlogSettings(locale || 'vi')
  }

  @Get('show-blog')
  async isBlogVisible() {
    return { show_blog: await this.settingsService.isBlogVisible() }
  }

  @Get('settings')
  getPublicSettings() {
    return this.settingsService.getPublicSettings()
  }
}
