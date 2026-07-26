import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { SettingsService } from './settings.service'
import { SiteSettingsDto } from './dto/site-settings.dto'

// Mirrors the settings admin server actions in src/lib/admin-actions.ts.
@UseGuards(JwtAuthGuard)
@Controller('admin/settings')
export class SettingsAdminController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getAdminSettings() {
    return this.settingsService.getAdminSettings()
  }

  @Put()
  setAdminSettings(@Body() settings: SiteSettingsDto) {
    return this.settingsService.setAdminSettings(settings)
  }

  @Get('blog')
  getAdminBlogSettings() {
    return this.settingsService.getAdminBlogSettings()
  }

  @Put('blog')
  setAdminBlogSettings(@Body() value: unknown) {
    return this.settingsService.setAdminBlogSettings(value)
  }
}
